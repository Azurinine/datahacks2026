import csv
import json
import math
import re
import random
from collections import defaultdict
from pathlib import Path


## Fish
# 1. Your exclusion list
calcifying_corals = [
    'Desmophyllum', 'Caryophyllia', 'Polymyces montereyensis', 
    'Adelogorgia phyllosclera', 'Eugorgia rubens', 
    'Antipathes dendrochristos', 'Lophelia pertusa'
]

def generate_key(scientific_name):
    genus = scientific_name.split(' ')[0]
    return re.sub(r'[^a-z]', '', genus.lower())

def fish_transform_csv(input_file, output_file):
    # Data storage
    raw_rows = []
    species_year_tracker = defaultdict(set)
    unique_fish_map = {}

    # --- Path Resolution ---
    input_path = Path(input_file)
    if not input_path.exists():
        project_root = Path(__file__).resolve().parents[3]
        alt = (project_root / input_file).resolve()
        if alt.exists():
            input_path = alt
        else:
            alt2 = (Path(__file__).resolve().parent / input_file).resolve()
            if alt2.exists():
                input_path = alt2
            else:
                raise FileNotFoundError("Input file not found.")

    output_path = Path(output_file)
    if not output_path.is_absolute():
        output_path = Path(__file__).resolve().parent / output_path

    # --- Pass 1: Read data and track year frequency ---
    with input_path.open(mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sci_name = row['ScientificName'].strip()
            
            if sci_name in calcifying_corals or not row['ObservationYear'] or not row['IndividualCount']:
                continue

            if sci_name not in unique_fish_map:
                unique_fish_map[sci_name] = generate_key(sci_name)
            
            engine_key = unique_fish_map[sci_name]
            year = int(row['ObservationYear'])
            count = int(float(row['IndividualCount']))

            # Track which years this species appears in
            species_year_tracker[engine_key].add(year)
            raw_rows.append((year, engine_key, count))

    # --- Determine Top 30 by Year Frequency ---
    # Sort by number of years present (primary) and name (secondary for stability)
    sorted_species = sorted(
        species_year_tracker.keys(), 
        key=lambda k: len(species_year_tracker[k]), 
        reverse=True
    )
    top_30_keys = set(sorted_species[:30])

    # --- Pass 2: Aggregate only the Top 30 ---
    final_populations = defaultdict(lambda: defaultdict(int))
    for year, key, count in raw_rows:
        if key in top_30_keys:
            final_populations[year][key] += count

    # --- Format into JSON ---
    output_data = []
    for year in sorted(final_populations.keys()):
        output_data.append({
            "year": year,
            "counts": dict(final_populations[year])
        })

    with output_path.open('w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2)

    print(f"✅ Success! Created {output_path}")
    print(f"Filtered for Top {len(top_30_keys)} species by year frequency.")
    print("Top species included:", sorted(list(top_30_keys)))

# Run it
fish_transform_csv('../../../data/coral.csv', 'populations.json')



## Coral Registry
calcifying_corals = [
    'Desmophyllum', 'Caryophyllia', 'Polymyces montereyensis',
    'Adelogorgia phyllosclera', 'Eugorgia rubens',
    'Antipathes dendrochristos', 'Lophelia pertusa'
]

def coral_registry_from_csv(input_file, output_file):
    input_path = Path(input_file)
    if not input_path.exists():
        project_root = Path(__file__).resolve().parents[3]
        alt = (project_root / input_file).resolve()
        if alt.exists():
            input_path = alt
        else:
            alt2 = (Path(__file__).resolve().parent / input_file).resolve()
            if alt2.exists():
                input_path = alt2
            else:
                raise FileNotFoundError("Input file not found.")

    output_path = Path(output_file)
    if not output_path.is_absolute():
        output_path = Path(__file__).resolve().parent / output_file

    species_total = defaultdict(int)
    species_last_year = {}
    all_years = set()

    with input_path.open(encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sci_name = row['ScientificName'].strip()
            if sci_name not in calcifying_corals or not row['ObservationYear'] or not row['IndividualCount']:
                continue

            year = int(row['ObservationYear'])
            count = int(float(row['IndividualCount']))
            all_years.add(year)
            species_total[sci_name] += count
            if sci_name not in species_last_year or year > species_last_year[sci_name]:
                species_last_year[sci_name] = year

    sorted_years = sorted(all_years)

    # Log10-normalize so dominant species don't swamp rare ones
    log_counts = {name: math.log10(count + 1) for name, count in species_total.items()}
    total_log_sum = sum(log_counts.values())

    registry_data = []
    for sci_name in calcifying_corals:
        if sci_name not in species_total:
            continue

        last_seen = species_last_year[sci_name]
        future_years = [y for y in sorted_years if y > last_seen]
        bleach_year = future_years[0] if future_years else None

        proportion = round(log_counts[sci_name] / total_log_sum, 4) if total_log_sum > 0 else 0
        random_color = "#%06x" % random.randint(0, 0xFFFFFF)
        engine_id = sci_name.lower().replace(' ', '_')

        registry_data.append({
            "id": engine_id,
            "name": sci_name,
            "color": random_color,
            "bleach_year": bleach_year,
            "proportion": proportion,
            "desc": ""
        })

    with output_path.open('w', encoding='utf-8') as f:
        json.dump(registry_data, f, indent=2)

    print(f"✅ Success! Wrote {len(registry_data)} species to {output_path}")

# Run it
coral_registry_from_csv('../../../data/coral.csv', 'coral_registry.json')