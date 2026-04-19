import csv
import json
import math
import re
import random
from collections import defaultdict
from pathlib import Path


def generate_key(scientific_name):
    genus = scientific_name.split(' ')[0]
    return re.sub(r'[^a-z]', '', genus.lower())


# Sponge genera — dropped entirely from all output files.
ALL_SPONGE_GENERA_KEYS = {
    'porifera', 'hexactinellida', 'demospongiae', 'calcarea',
    'rossellidae', 'aphrocallistes', 'farrea', 'heterochone',
    'acanthascus', 'mycale', 'poecillastra', 'suberites',
    'thenea', 'hyalonema', 'leucandra', 'tethya',
    'asbestopluma', 'polymastia', 'rhizaxinella',
    'haliclona', 'cliona', 'geodia', 'petrosia',
    'amphilectus', 'xestospongia', 'ircinia', 'aplysina',
    'axinella', 'halichondria', 'callyspongia', 'dysidea',
}

COMMON_CORAL_NAMES = {
    'antipathes': 'Black Coral',
    'balticina': 'Sea Whip Pen',
    'eugorgia': 'Bright Sea Fan',
    'leptogorgia': 'Sea Whip',
    'octocorallia': 'Soft Coral',
    'paragorgia': 'Bubblegum Coral',
    'pennatuloidea': 'Sea Pen',
    'plumarella': 'Feather Coral',
    'ptilosarcus': 'Fleshy Sea Pen',
    'stylatula': 'Needle Sea Pen'
}

CORAL_DESCRIPTIONS = {
    'antipathes': 'These deep-water organisms possess a distinct dark, thorny skeleton often used for jewelry.',
    'balticina': 'A genus of slender, whip-like sea pens that inhabit soft muddy bottoms in deep-sea environments.',
    'eugorgia': 'Vibrant sea fans characterized by intricate, colorful branching patterns often found in tropical and subtropical reefs.',
    'leptogorgia': 'These gorgonians have flexible, slender branches that sway with the ocean currents.',
    'octocorallia': 'A broad subclass of corals (including soft corals and sea fans) defined by their eight-fold radial symmetry.',
    'paragorgia': 'Known for its bulbous, colorful tips; it forms large, tree-like structures in the deep sea.',
    'pennatuloidea': 'A group of colonial cnidarians, which anchor themselves into soft sediment using a fleshy bulb.',
    'plumarella': 'Delicate, fan-shaped gorgonians with fine, feathery branches typically found in deep, cold waters.',
    'ptilosarcus': 'These orange-hued organisms resemble large, stout feathers.',
    'stylatula': 'Very slender, needle-like sea pens that can retract into the sand when disturbed by predators or strong flows.'
}

# All coral genera (engine keys). Any species whose genus key is in this set
# goes to coral_registry; everything else is treated as fish.
ALL_CORAL_GENERA_KEYS = {
    # Sea pens (Pennatulacea)
    'pennatuloidea', 'pennatulidae', 'ptilosarcus', 'stylatula', 'pennatula',
    'anthoptilum', 'stachyptilum', 'balticina', 'virgularia', 'acanthoptilum',
    # Soft corals / Octocorallia
    'octocorallia', 'heteropolypus',
    # Gorgonians
    'leptogorgia', 'paragorgia', 'plumarella', 'swiftia',
    'acanthogorgia', 'callistephanus', 'adelogorgia', 'eugorgia',
    'chromoplexaura', 'placogorgia', 'plexauridae', 'narella',
    # Stony / cup corals (Scleractinia)
    'desmophyllum', 'caryophyllia', 'polymyces', 'lophelia',
    'coenocyathus', 'scleractinia',
    # Black corals (Antipatharia)
    'antipathes',
    # Hydrocorals (Stylasteridae)
    'stylaster', 'stylasteridae',
    # Additional gorgonians / octocorals
    'euplexaura', 'muricea', 'parastenella', 'gorgoniidae',
    'primnoidae', 'plexauridae', 'clavularia', 'anthomastus',
    'malacalcyonacea',
    # Additional stony corals / families
    'caryophylliidae', 'flabellidae', 'scleractinia',
}


def resolve_input_path(input_file):
    input_path = Path(input_file)
    if input_path.exists():
        return input_path
    for base in [Path(__file__).resolve().parents[3], Path(__file__).resolve().parent]:
        alt = (base / input_file).resolve()
        if alt.exists():
            return alt
    raise FileNotFoundError(f"Input file not found: {input_file}")


# ─────────────────────────────────────────────────────────────
# 1. populations.json  (top-30 non-coral species by year freq)
# ─────────────────────────────────────────────────────────────
def fish_transform_csv(input_file, output_file):
    input_path = resolve_input_path(input_file)
    output_path = Path(output_file)
    if not output_path.is_absolute():
        output_path = Path(__file__).resolve().parent / output_path

    raw_rows = []
    species_year_tracker = defaultdict(set)

    with input_path.open(mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sci_name = row['ScientificName'].strip()
            if not row['ObservationYear'] or not row['IndividualCount']:
                continue

            engine_key = generate_key(sci_name)
            if engine_key in ALL_CORAL_GENERA_KEYS or engine_key in ALL_SPONGE_GENERA_KEYS:
                continue

            year = int(row['ObservationYear'])
            count = int(float(row['IndividualCount']))
            species_year_tracker[engine_key].add(year)
            raw_rows.append((year, engine_key, count))

    sorted_species = sorted(
        species_year_tracker.keys(),
        key=lambda k: len(species_year_tracker[k]),
        reverse=True
    )
    top_30_keys = set(sorted_species[:30])

    final_populations = defaultdict(lambda: defaultdict(int))
    for year, key, count in raw_rows:
        if key in top_30_keys:
            final_populations[year][key] += count

    output_data = [
        {"year": year, "counts": dict(final_populations[year])}
        for year in sorted(final_populations.keys())
    ]

    with output_path.open('w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2)

    print(f"✅ populations.json — top {len(top_30_keys)} non-coral species")
    print("  Species:", sorted(top_30_keys))


# ─────────────────────────────────────────────────────────────
# 2. coral_registry.json  (top-10 coral species by year freq)
# ─────────────────────────────────────────────────────────────
def coral_registry_from_csv(input_file, output_file):
    input_path = resolve_input_path(input_file)
    output_path = Path(output_file)
    if not output_path.is_absolute():
        output_path = Path(__file__).resolve().parent / output_file

    raw_rows = []
    species_year_tracker = defaultdict(set)
    species_total = defaultdict(int)
    species_last_year = {}
    all_years = set()

    with input_path.open(encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sci_name = row['ScientificName'].strip()
            if not row['ObservationYear'] or not row['IndividualCount']:
                continue

            engine_key = generate_key(sci_name)
            if engine_key not in ALL_CORAL_GENERA_KEYS:
                continue

            year = int(row['ObservationYear'])
            count = int(float(row['IndividualCount']))
            all_years.add(year)
            species_year_tracker[engine_key].add(year)
            species_total[engine_key] += count
            if engine_key not in species_last_year or year > species_last_year[engine_key]:
                species_last_year[engine_key] = year
            raw_rows.append((engine_key, year, count))

    # Top 10 by year frequency (same logic as fish top-30)
    sorted_species = sorted(
        species_year_tracker.keys(),
        key=lambda k: len(species_year_tracker[k]),
        reverse=True
    )
    top_10_keys = set(sorted_species[:10])

    sorted_years = sorted(all_years)
    top_totals = {k: v for k, v in species_total.items() if k in top_10_keys}
    log_counts = {k: math.log10(v + 1) for k, v in top_totals.items()}
    total_log_sum = sum(log_counts.values())

    registry_data = []
    for engine_key in sorted(top_10_keys):
        last_seen = species_last_year[engine_key]
        future_years = [y for y in sorted_years if y > last_seen]
        bleach_year = future_years[0] if future_years else None
        proportion = round(log_counts[engine_key] / total_log_sum, 4) if total_log_sum > 0 else 0

        common_name = COMMON_CORAL_NAMES.get(engine_key, engine_key.capitalize())
        description = CORAL_DESCRIPTIONS.get(engine_key, "Information pending classification.")

        registry_data.append({
            "id": engine_key,
            "name": common_name,
            "color": "#%06x" % random.randint(0, 0xFFFFFF),
            "bleach_year": bleach_year,
            "proportion": proportion,
            # This is the line to update:
            "desc": description
        })

    with output_path.open('w', encoding='utf-8') as f:
        json.dump(registry_data, f, indent=2)

    print(f"✅ coral_registry.json — {len(registry_data)} coral species")
    print("  Species:", sorted(e['id'] for e in registry_data))


# ─────────────────────────────────────────────────────────────
# 3. fish_metadata.json  (strip coral entries, keep sponges)
# ─────────────────────────────────────────────────────────────
def filter_fish_metadata(input_file, output_file):
    input_path = Path(input_file)
    if not input_path.is_absolute():
        input_path = Path(__file__).resolve().parent / input_file
    output_path = Path(output_file)
    if not output_path.is_absolute():
        output_path = Path(__file__).resolve().parent / output_file

    with input_path.open(encoding='utf-8') as f:
        metadata = json.load(f)

    before = len(metadata)
    metadata = [m for m in metadata if m['id'] not in ALL_CORAL_GENERA_KEYS and m['id'] not in ALL_SPONGE_GENERA_KEYS]
    after = len(metadata)

    with output_path.open('w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)

    print(f"✅ fish_metadata.json — removed {before - after} coral entries, {after} remain")


# ─────────────────────────────────────────────────────────────
# 4. fish_metadata.json  (add missing species from populations)
# ─────────────────────────────────────────────────────────────
KNOWN_NAMES = {
    'anoplopoma':       'Sablefish',
    'argentina':        'Argentine',
    'bathyagonus':      'Poacher Fish',
    'caliraja':         'Skate',
    'cataetyx':         'Brotula',
    'citharichthys':    'Pacific Sanddab',
    'enophrys':         'Buffalo Sculpin',
    'eptatretus':       'Pacific Hagfish',
    'glyptocephalus':   'Rex Sole',
    'hydrolagus':       'Chimaera',
    'icelinus':         'Sculpin',
    'lycenchelys':      'Eelpout',
    'lycodes':          'Eelpout',
    'macrouridae':      'Grenadier',
    'merluccius':       'Pacific Hake',
    'microstomus':      'Dover Sole',
    'myctophidae':      'Lanternfish',
    'nettastomatidae':  'Duckbill Eel',
    'nezumia':          'Rattail',
    'ophidiidae':       'Cusk Eel',
    'parophrys':        'English Sole',
    'pleuronectiformes':'Flatfish',
    'pleuronichthys':   'Turbot',
    'porichthys':       'Midshipman Fish',
    'scyliorhinidae':   'Catshark',
    'sebastes':         'Rockfish',
    'sebastolobus':     'Shortspine Thornyhead',
    'xeneretmus':       'Blacktip Poacher',
    'zalembius':        'Pink Seaperch',
    'zaniolepis':       'Combfish',
}

def augment_fish_metadata(metadata_file, populations_file):
    meta_path = Path(metadata_file)
    if not meta_path.is_absolute():
        meta_path = Path(__file__).resolve().parent / metadata_file
    pop_path = Path(populations_file)
    if not pop_path.is_absolute():
        pop_path = Path(__file__).resolve().parent / populations_file

    with meta_path.open(encoding='utf-8') as f:
        metadata = json.load(f)
    with pop_path.open(encoding='utf-8') as f:
        populations = json.load(f)

    existing_ids = {m['id'] for m in metadata}

    # Total count per species across all years
    species_totals = defaultdict(int)
    for entry in populations:
        for species, count in entry['counts'].items():
            species_totals[species] += count

    added = 0
    for species_id in sorted(species_totals.keys()):
        if species_id in existing_ids:
            continue
        metadata.append({
            "id": species_id,
            "name": KNOWN_NAMES.get(species_id, species_id),
            "color": "#%06x" % random.randint(0, 0xFFFFFF),
            "count": species_totals[species_id],
            "speedMultiplier": round(random.uniform(0.83, 1.45), 4),
            "scale": round(random.uniform(0.81, 1.43), 4),
            "preferredHeight": round(random.uniform(1.5, 5.7), 4),
            "desc": ""
        })
        added += 1

    with meta_path.open('w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)

    print(f"✅ fish_metadata.json — added {added} new entries, {len(metadata)} total")


# ─────────────────────────────────────────────────────────────
# Run all
# ─────────────────────────────────────────────────────────────
fish_transform_csv('../../../data/coral.csv', 'populations.json')
coral_registry_from_csv('../../../data/coral.csv', 'coral_registry.json')
filter_fish_metadata('fish_metadata.json', 'fish_metadata.json')
augment_fish_metadata('fish_metadata.json', 'populations.json')
