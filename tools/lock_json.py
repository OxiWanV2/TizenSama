#!/usr/bin/env python3
import argparse
import base64
import getpass
import hashlib
import hmac
import json
import os
import secrets
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "app", "data")
DEFAULT_OUT = os.path.join(ROOT, "dist", "tizen")
DEFAULT_ITERATIONS = 100000
VERSION = 1
LABEL_ENC = b"tizensama/enc"
LABEL_MAC = b"tizensama/mac"
LABEL_CHECK = b"tizensama/check"
LABEL_FILE = b"tizensama/file"

try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    HAVE_CRYPTOGRAPHY = True
except ImportError:
    HAVE_CRYPTOGRAPHY = False


def _rotl8(x, s):
    return ((x << s) | (x >> (8 - s))) & 0xFF


def _build_tables():
    sbox = [0] * 256
    p = q = 1
    while True:
        p = (p ^ (p << 1) ^ (0x1B if p & 0x80 else 0)) & 0xFF
        q ^= q << 1
        q &= 0xFF
        q ^= q << 2
        q &= 0xFF
        q ^= q << 4
        q &= 0xFF
        if q & 0x80:
            q ^= 0x09
        sbox[p] = (q ^ _rotl8(q, 1) ^ _rotl8(q, 2) ^ _rotl8(q, 3) ^ _rotl8(q, 4) ^ 0x63) & 0xFF
        if p == 1:
            break
    sbox[0] = 0x63
    te = [[0] * 256 for _ in range(4)]
    for x in range(256):
        s = sbox[x]
        s2 = ((s << 1) ^ 0x1B) & 0xFF if s & 0x80 else s << 1
        s3 = s2 ^ s
        w = (s2 << 24) | (s << 16) | (s << 8) | s3
        te[0][x] = w
        te[1][x] = ((w >> 8) | (w << 24)) & 0xFFFFFFFF
        te[2][x] = ((w >> 16) | (w << 16)) & 0xFFFFFFFF
        te[3][x] = ((w >> 24) | (w << 8)) & 0xFFFFFFFF
    return sbox, te


SBOX, TE = _build_tables()
RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40]


def _expand_key(key):
    words = [int.from_bytes(key[i:i + 4], "big") for i in range(0, 32, 4)]
    for i in range(8, 60):
        temp = words[i - 1]
        if i % 8 == 0:
            temp = ((temp << 8) | (temp >> 24)) & 0xFFFFFFFF
            temp = (SBOX[temp >> 24] << 24) | (SBOX[(temp >> 16) & 0xFF] << 16) | (SBOX[(temp >> 8) & 0xFF] << 8) | SBOX[temp & 0xFF]
            temp ^= RCON[i // 8 - 1] << 24
        elif i % 8 == 4:
            temp = (SBOX[temp >> 24] << 24) | (SBOX[(temp >> 16) & 0xFF] << 16) | (SBOX[(temp >> 8) & 0xFF] << 8) | SBOX[temp & 0xFF]
        words.append(words[i - 8] ^ temp)
    return words


def _encrypt_block(rk, block):
    t0, t1, t2, t3 = TE
    sb = SBOX
    s0 = int.from_bytes(block[0:4], "big") ^ rk[0]
    s1 = int.from_bytes(block[4:8], "big") ^ rk[1]
    s2 = int.from_bytes(block[8:12], "big") ^ rk[2]
    s3 = int.from_bytes(block[12:16], "big") ^ rk[3]
    for r in range(1, 14):
        k = r * 4
        u0 = t0[s0 >> 24] ^ t1[(s1 >> 16) & 0xFF] ^ t2[(s2 >> 8) & 0xFF] ^ t3[s3 & 0xFF] ^ rk[k]
        u1 = t0[s1 >> 24] ^ t1[(s2 >> 16) & 0xFF] ^ t2[(s3 >> 8) & 0xFF] ^ t3[s0 & 0xFF] ^ rk[k + 1]
        u2 = t0[s2 >> 24] ^ t1[(s3 >> 16) & 0xFF] ^ t2[(s0 >> 8) & 0xFF] ^ t3[s1 & 0xFF] ^ rk[k + 2]
        u3 = t0[s3 >> 24] ^ t1[(s0 >> 16) & 0xFF] ^ t2[(s1 >> 8) & 0xFF] ^ t3[s2 & 0xFF] ^ rk[k + 3]
        s0, s1, s2, s3 = u0, u1, u2, u3
    k = 56
    c0 = ((sb[s0 >> 24] << 24) | (sb[(s1 >> 16) & 0xFF] << 16) | (sb[(s2 >> 8) & 0xFF] << 8) | sb[s3 & 0xFF]) ^ rk[k]
    c1 = ((sb[s1 >> 24] << 24) | (sb[(s2 >> 16) & 0xFF] << 16) | (sb[(s3 >> 8) & 0xFF] << 8) | sb[s0 & 0xFF]) ^ rk[k + 1]
    c2 = ((sb[s2 >> 24] << 24) | (sb[(s3 >> 16) & 0xFF] << 16) | (sb[(s0 >> 8) & 0xFF] << 8) | sb[s1 & 0xFF]) ^ rk[k + 2]
    c3 = ((sb[s3 >> 24] << 24) | (sb[(s0 >> 16) & 0xFF] << 16) | (sb[(s1 >> 8) & 0xFF] << 8) | sb[s2 & 0xFF]) ^ rk[k + 3]
    return c0.to_bytes(4, "big") + c1.to_bytes(4, "big") + c2.to_bytes(4, "big") + c3.to_bytes(4, "big")


def aes_ctr(key, iv, data):
    if HAVE_CRYPTOGRAPHY:
        enc = Cipher(algorithms.AES(key), modes.CTR(iv)).encryptor()
        return enc.update(data) + enc.finalize()
    rk = _expand_key(key)
    prefix = iv[:8]
    counter = int.from_bytes(iv[8:], "big")
    out = bytearray(len(data))
    for off in range(0, len(data), 16):
        block = _encrypt_block(rk, prefix + (counter & 0xFFFFFFFFFFFFFFFF).to_bytes(8, "big"))
        counter += 1
        chunk = data[off:off + 16]
        n = len(chunk)
        out[off:off + n] = bytes(a ^ b for a, b in zip(chunk, block[:n]))
    return bytes(out)


def b64(data):
    return base64.b64encode(data).decode("ascii")


def unb64(text):
    return base64.b64decode(text)


def derive_keys(pin, salt, iterations):
    master = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, iterations, 32)
    enc_key = hmac.new(master, LABEL_ENC, hashlib.sha256).digest()
    mac_key = hmac.new(master, LABEL_MAC, hashlib.sha256).digest()
    return enc_key, mac_key


def file_mac(mac_key, name, iv, ct):
    h = hmac.new(mac_key, LABEL_FILE, hashlib.sha256)
    h.update(name.encode("utf-8"))
    h.update(b"\x00")
    h.update(iv)
    h.update(ct)
    return h.digest()


def check_value(mac_key):
    return hmac.new(mac_key, LABEL_CHECK, hashlib.sha256).digest()


def encrypt_file(args):
    src, dst, name, enc_key, mac_key = args
    with open(src, "rb") as handle:
        plain = handle.read()
    json.loads(plain.decode("utf-8"))
    iv = secrets.token_bytes(8) + b"\x00" * 8
    ct = aes_ctr(enc_key, iv, plain)
    envelope = {"v": VERSION, "iv": b64(iv), "ct": b64(ct), "mac": b64(file_mac(mac_key, name, iv, ct))}
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as handle:
        json.dump(envelope, handle, separators=(",", ":"))
    return len(plain)


def decrypt_file(args):
    src, dst, name, enc_key, mac_key = args
    with open(src, "r", encoding="utf-8") as handle:
        envelope = json.load(handle)
    if envelope.get("v") != VERSION:
        raise ValueError("%s: version inconnue" % name)
    iv = unb64(envelope["iv"])
    ct = unb64(envelope["ct"])
    if not hmac.compare_digest(file_mac(mac_key, name, iv, ct), unb64(envelope["mac"])):
        raise ValueError("%s: authentification échouée" % name)
    plain = aes_ctr(enc_key, iv, ct)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "wb") as handle:
        handle.write(plain)
    return len(plain)


def list_json(root):
    out = []
    for base, _, files in os.walk(root):
        for fname in sorted(files):
            if not fname.endswith(".json") or fname == "manifest.json":
                continue
            path = os.path.join(base, fname)
            out.append((path, os.path.relpath(path, root).replace(os.sep, "/")))
    out.sort(key=lambda e: e[1])
    return out


def read_manifest(out_dir):
    path = os.path.join(out_dir, "manifest.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        if manifest.get("v") == VERSION and manifest.get("salt") and manifest.get("iter"):
            return manifest
    except (OSError, ValueError):
        pass
    return None


def ask_pin(confirm):
    env = os.environ.get("TIZENSAMA_PIN")
    if env:
        pin = env.strip()
    else:
        pin = getpass.getpass("Code PIN (4 à 12 chiffres) : ").strip()
        if confirm:
            again = getpass.getpass("Confirmez le code PIN : ").strip()
            if again != pin:
                sys.exit("Les deux codes ne correspondent pas.")
    if not pin.isdigit() or not 4 <= len(pin) <= 12:
        sys.exit("Le code PIN doit contenir entre 4 et 12 chiffres.")
    return pin


def run(pool, fn, jobs, label):
    total = 0
    done = 0
    for size in pool.map(fn, jobs, chunksize=8):
        total += size
        done += 1
        if done % 100 == 0 or done == len(jobs):
            sys.stdout.write("\r%s %d/%d" % (label, done, len(jobs)))
            sys.stdout.flush()
    sys.stdout.write("\n")
    return total


def lock(args):
    files = list_json(args.src)
    if not files:
        sys.exit("Aucun fichier JSON dans %s (lancez d'abord tools/build_catalogue.py)." % args.src)
    previous = read_manifest(args.out)
    if previous and not args.new_salt:
        salt = unb64(previous["salt"])
        iterations = int(previous["iter"])
    else:
        salt = secrets.token_bytes(16)
        iterations = args.iterations
    pin = ask_pin(confirm=not previous or args.new_salt)
    enc_key, mac_key = derive_keys(pin, salt, iterations)
    check = check_value(mac_key)
    if previous and not args.new_salt:
        if hmac.compare_digest(check, unb64(previous.get("check", ""))):
            print("Même code PIN que la version précédente : les TV déjà déverrouillées le resteront.")
        else:
            print("Nouveau code PIN : il sera redemandé sur les TV au prochain lancement.")
    if os.path.isdir(args.out):
        shutil.rmtree(args.out)
    os.makedirs(args.out, exist_ok=True)
    jobs = [(src, os.path.join(args.out, name), name, enc_key, mac_key) for src, name in files]
    with ProcessPoolExecutor() as pool:
        total = run(pool, encrypt_file, jobs, "chiffrement")
    manifest = {
        "v": VERSION,
        "kdf": "pbkdf2-sha256",
        "iter": iterations,
        "salt": b64(salt),
        "check": b64(check),
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(files),
    }
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, separators=(",", ":"))
    print("%d fichiers chiffrés (%.1f Mo en clair) dans %s" % (len(files), total / 1048576.0, args.out))
    print("Publiez le contenu de ce dossier tel quel à l'URL des données (manifest.json inclus).")


def unlock(args):
    manifest = read_manifest(args.src)
    if not manifest:
        sys.exit("Aucun manifest.json valide dans %s." % args.src)
    files = list_json(args.src)
    pin = ask_pin(confirm=False)
    enc_key, mac_key = derive_keys(pin, unb64(manifest["salt"]), int(manifest["iter"]))
    if not hmac.compare_digest(check_value(mac_key), unb64(manifest["check"])):
        sys.exit("Code PIN incorrect.")
    os.makedirs(args.out, exist_ok=True)
    jobs = [(src, os.path.join(args.out, name), name, enc_key, mac_key) for src, name in files]
    with ProcessPoolExecutor() as pool:
        total = run(pool, decrypt_file, jobs, "déchiffrement")
    print("%d fichiers déchiffrés (%.1f Mo) dans %s" % (len(files), total / 1048576.0, args.out))


def main():
    parser = argparse.ArgumentParser(description="Chiffre les JSON du catalogue avec un code PIN pour publication.")
    parser.add_argument("--src", default=None, help="dossier source (défaut : app/data, ou dist/tizen avec --unlock)")
    parser.add_argument("--out", default=None, help="dossier de sortie (défaut : dist/tizen, ou app/data avec --unlock)")
    parser.add_argument("--iterations", type=int, default=DEFAULT_ITERATIONS, help="itérations PBKDF2 pour un nouveau sel")
    parser.add_argument("--new-salt", action="store_true", help="régénère le sel même si un manifest existe déjà")
    parser.add_argument("--unlock", action="store_true", help="déchiffre un dossier publié au lieu de chiffrer")
    args = parser.parse_args()
    if args.unlock:
        args.src = os.path.abspath(args.src or DEFAULT_OUT)
        args.out = os.path.abspath(args.out or DEFAULT_SRC)
        unlock(args)
    else:
        args.src = os.path.abspath(args.src or DEFAULT_SRC)
        args.out = os.path.abspath(args.out or DEFAULT_OUT)
        if args.iterations < 10000:
            sys.exit("Au moins 10000 itérations.")
        lock(args)


if __name__ == "__main__":
    main()
