#!/usr/bin/env python3
import json
import os
import re
import shutil
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "catalogue.json")
OUT = os.path.join(ROOT, "app", "data")

TMDB_PREFIX = "https://image.tmdb.org/t/p/w342/"
THUMB_PATTERN = "https://cdn.jsdelivr.net/gh/Anime-Sama/IMG@img/contenu/thumb/{slug}.webp"
IMAGE_PATTERN = "https://raw.githubusercontent.com/Anime-Sama/IMG/img/contenu/{slug}.jpg"

STATUS = {
    "Terminé": "ended",
    "En cours": "ongoing",
    "À venir": "upcoming",
    "Annulé": "cancelled",
}

LANG_LABELS = {
    "vostfr": "VOSTFR",
    "vf": "VF",
    "vf1": "VF 1",
    "vf2": "VF 2",
    "va": "VA",
    "vj": "VJ",
    "vkr": "VKR",
    "vcn": "VCN",
    "vqc": "VQC",
    "var": "VAR",
}

PAIRS = {
    ("Science", "Fiction"): ["Science-fiction"],
    ("Science", "fiction"): ["Science-fiction"],
    ("Science", "Fiction & Fantastique"): ["Science-fiction", "Fantastique"],
    ("Post", "apocalyptique"): ["Post-apocalyptique"],
    ("Super", "héros"): ["Super-héros"],
    ("Aliens / Extra", "terrestres"): ["Aliens / Extra-terrestres"],
    ("Ping", "pong"): ["Ping-pong"],
    ("E", "sport"): ["E-sport"],
    ("Monster", "Girl"): ["Monster Girl"],
    ("Homme", "Bête"): ["Homme-bête"],
    ("Sports", "mécaniques"): ["Sports mécaniques"],
    ("Harem", "inversé"): ["Harem inversé"],
    ("Dieux", "Déesses"): ["Dieux / Déesses"],
}

CANON = {
    "Com?die": "Comédie",
    "Comedie": "Comédie",
    "Myst?re": "Mystère",
    "Mystere": "Mystère",
    "Sh?nen": "Shônen",
    "Shonen": "Shônen",
    "Shojo": "Shôjo",
    "Ecole": "École",
    "Mecha": "Mechas",
    "Magical girls": "Magical girl",
    "Magical Girl": "Magical girl",
    "Super Pouvoirs": "Super pouvoirs",
    "Super héros": "Super-héros",
    "Arts Martiaux": "Arts martiaux",
    "Sports": "Sport",
    "Yôkai": "Yokai",
    "Réincarnation / transmigration": "Réincarnation / Transmigration",
    "Réincarnation": "Réincarnation / Transmigration",
    "Horreur/Epouvante": "Horreur / Épouvante",
    "Erotique": "Érotique",
    "Science fiction": "Science-fiction",
    "Fiction": "Science-fiction",
    "fiction": "Science-fiction",
    "Fiction & Fantastique": "Fantastique",
    "Military": "Militaire",
    "Mythology": "Mythologie",
    "Samourai": "Samouraïs",
    "Aliens": "Aliens / Extra-terrestres",
    "Dieux": "Dieux / Déesses",
    "Déesses": "Dieux / Déesses",
    "Robots": "Robots",
    "WebComics": "Webcomic",
    "Webanime": "Webcomic",
    "Historique\\n": "Historique",
}

DROP_GENRES = {"Science", "Post", "Super", "Aliens / Extra", "terrestres", "apocalyptique", "héros", "Ping", "pong", "E", "sport", "Monster", "Girl", "Homme", "Bête", "mécaniques", "inversé", ""}

NON_EMBEDDABLE_HOSTS = ("animationdigitalnetwork",)
GENERIC_SEGMENTS = {"embed", "e", "iframe", "video", "videoembed", "v", "player", "watch"}


def clean_genre_token(raw):
    token = raw.replace("\\r\\n", "").replace("\\n", "").replace("\r", "").replace("\n", "").strip()
    return token


def normalize_genres(raw_list):
    tokens = [clean_genre_token(g) for g in raw_list]
    tokens = [t for t in tokens if t]
    merged = []
    i = 0
    while i < len(tokens):
        if i + 1 < len(tokens) and (tokens[i], tokens[i + 1]) in PAIRS:
            merged.extend(PAIRS[(tokens[i], tokens[i + 1])])
            i += 2
            continue
        merged.append(tokens[i])
        i += 1
    result = []
    for t in merged:
        t = CANON.get(t, t)
        if t in DROP_GENRES:
            continue
        if t not in result:
            result.append(t)
    return result


def strip_accents(text):
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def search_key(text):
    text = strip_accents(text.lower())
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_year(infos):
    for key in ("Diffusion", "Début", "Sortie", "Saison"):
        value = infos.get(key) or ""
        match = re.search(r"(19|20)\d{2}", value)
        if match:
            return int(match.group(0))
    return None


def parse_duration(infos):
    value = (infos.get("Durée") or "").strip()
    if not value:
        return ""
    value = value.replace(" / ép.", "").replace("/ ép.", "")
    return value.strip()


def valid_player_url(url):
    url = (url or "").strip()
    if not re.match(r"^https?://", url):
        return False
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if not host or any(h in host for h in NON_EMBEDDABLE_HOSTS):
        return False
    if "vk.com" in host or "vkvideo.ru" in host:
        query = parse_qs(parsed.query)
        oid = query.get("oid", [""])[0]
        vid = query.get("id", [""])[0]
        return bool(re.match(r"^-?\d+$", oid)) and bool(re.match(r"^\d+$", vid))
    if "#" in url:
        candidate = parsed.fragment
    elif parsed.query:
        values = [v for v in re.split(r"[&;]", parsed.query) if v]
        candidate = values[-1].split("=", 1)[1] if values and "=" in values[-1] else ""
    else:
        segments = [s for s in parsed.path.split("/") if s]
        candidate = segments[-1] if segments else ""
    candidate = re.sub(r"\.html?$", "", candidate)
    candidate = re.sub(r"^embed-", "", candidate)
    if candidate.lower() in GENERIC_SEGMENTS:
        return False
    return bool(re.match(r"^[A-Za-z0-9_-]{4,}$", candidate))


def build_season(season):
    langs = {}
    for code, info in (season.get("languages") or {}).items():
        episodes = []
        for ep in info.get("episodes") or []:
            players = []
            seen = set()
            for p in ep.get("players") or []:
                url = (p.get("url") or "").strip()
                if url in seen or not valid_player_url(url):
                    continue
                seen.add(url)
                players.append([p.get("player") or urlparse(url).netloc, url])
            episodes.append(players)
        while episodes and not episodes[-1]:
            episodes.pop()
        if any(episodes):
            langs[code] = {"count": len(episodes), "episodes": episodes}
    if not langs:
        return None
    name = season.get("name") or ""
    base = season.get("base_path") or ""
    if name == "nom":
        name = "Saison 1"
    return {"id": base, "name": name, "langs": langs}


def poster_ref(url):
    if url.startswith(TMDB_PREFIX):
        return url[len(TMDB_PREFIX):]
    return url


def main():
    with open(SRC, "r", encoding="utf-8") as handle:
        catalogue = json.load(handle)
    animes = catalogue.get("animes") or []

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "anime"), exist_ok=True)

    genre_counter = Counter()
    prepared = []
    skipped = 0
    for anime in animes:
        seasons = []
        for season in anime.get("seasons") or []:
            if season.get("base_path") in ("url", ""):
                continue
            built = build_season(season)
            if built:
                seasons.append(built)
        if not seasons:
            skipped += 1
            continue
        genres = normalize_genres(anime.get("genres") or [])
        for g in genres:
            genre_counter[g] += 1
        prepared.append((anime, seasons, genres))

    genres_sorted = [g for g, _ in genre_counter.most_common()]
    genre_index = {g: i for i, g in enumerate(genres_sorted)}

    items = []
    search = []
    for anime, seasons, genres in prepared:
        slug = anime["slug"]
        infos = anime.get("infos") or {}
        title = (anime.get("title") or anime.get("name") or slug).strip()
        alt_titles = []
        for alt in anime.get("alt_titles") or []:
            alt = (alt or "").strip()
            if alt and alt != title and alt not in alt_titles:
                alt_titles.append(alt)
        langs = []
        for season in seasons:
            for code in season["langs"]:
                if code not in langs:
                    langs.append(code)
        total_episodes = sum(max(l["count"] for l in season["langs"].values()) for season in seasons)
        year = parse_year(infos)
        status = STATUS.get((infos.get("Statut") or "").strip(), "")
        item = {
            "id": slug,
            "t": title,
            "p": poster_ref(anime.get("poster") or ""),
            "y": year,
            "s": status,
            "f": (infos.get("Format") or "").strip(),
            "g": [genre_index[g] for g in genres],
            "l": langs,
            "e": total_episodes,
            "n": len(seasons),
            "ss": (infos.get("Saison") or "").strip(),
            "ty": anime.get("types") or [],
            "d": parse_duration(infos),
        }
        thumb = anime.get("thumb") or ""
        if thumb != THUMB_PATTERN.format(slug=slug):
            item["th"] = thumb
        items.append(item)

        keys = [search_key(title)] + [search_key(a) for a in alt_titles]
        keys = [k for k in keys if k]
        deduped = []
        for k in keys:
            if k not in deduped:
                deduped.append(k)
        search.append([slug, "|".join(deduped)])

        detail = {
            "id": slug,
            "title": title,
            "alt": alt_titles,
            "synopsis": (anime.get("synopsis") or "").strip(),
            "infos": {k: v for k, v in infos.items() if v},
            "genres": genres,
            "poster": anime.get("poster") or "",
            "image": anime.get("image") or IMAGE_PATTERN.format(slug=slug),
            "thumb": thumb or THUMB_PATTERN.format(slug=slug),
            "types": anime.get("types") or [],
            "langs": langs,
            "year": year,
            "status": status,
            "format": item["f"],
            "seasonLabel": item["ss"],
            "duration": item["d"],
            "episodes": total_episodes,
            "seasons": seasons,
        }
        with open(os.path.join(OUT, "anime", slug + ".json"), "w", encoding="utf-8") as handle:
            json.dump(detail, handle, ensure_ascii=False, separators=(",", ":"))

    items.sort(key=lambda it: search_key(it["t"]))
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    index = {
        "generated": generated,
        "source": catalogue.get("source") or "",
        "count": len(items),
        "genres": genres_sorted,
        "langs": LANG_LABELS,
        "items": items,
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as handle:
        json.dump(index, handle, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "search.json"), "w", encoding="utf-8") as handle:
        json.dump(search, handle, ensure_ascii=False, separators=(",", ":"))

    total_bytes = 0
    for base, _, files in os.walk(OUT):
        for name in files:
            total_bytes += os.path.getsize(os.path.join(base, name))
    print("animes: %d (ignorés sans épisode: %d)" % (len(items), skipped))
    print("genres: %d" % len(genres_sorted))
    print("index.json: %d octets" % os.path.getsize(os.path.join(OUT, "index.json")))
    print("search.json: %d octets" % os.path.getsize(os.path.join(OUT, "search.json")))
    print("total data: %.1f Mo" % (total_bytes / 1048576.0))


if __name__ == "__main__":
    main()
