import csv
import json
import re
from collections import defaultdict
from pathlib import Path

# 1. Your exclusion list
calcifying_corals = [
    'Desmophyllum', 'Caryophyllia', 'Polymyces montereyensis', 
    'Adelogorgia phyllosclera', 'Eugorgia rubens', 
    'Antipathes dendrochristos', 'Lophelia pertusa'
]

def generate_key(scientific_name):
    # Takes "Sebastes paucispinis" -> "sebastes"
    # This becomes the key in your JSON and your Three.js engine
    genus = scientific_name.split(' ')[0]
    return re.sub(r'[^a-z]', '', genus.lower())

def transform_csv(input_file, output_file):
    populations = defaultdict(lambda: defaultdict(int))
    unique_fish_map = {}

    # Resolve input path: try as given, then relative to project root, then relative to this script
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
                raise FileNotFoundError(
                    f"Input file not found. Tried: {input_file}, {alt}, {alt2}"
                )

    # Resolve output path: if relative, write next to this script
    output_path = Path(output_file)
    if not output_path.is_absolute():
        output_path = Path(__file__).resolve().parent / output_path

    with input_path.open(mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sci_name = row['ScientificName'].strip()
            
            # Skip if it's a coral
            if sci_name in calcifying_corals:
                continue
                
            # Skip empty or invalid rows
            if not row['ObservationYear'] or not row['IndividualCount']:
                continue

            # Generate or retrieve the engine key (e.g., 'chromis')
            if sci_name not in unique_fish_map:
                unique_fish_map[sci_name] = generate_key(sci_name)
            
            engine_key = unique_fish_map[sci_name]
            year = int(row['ObservationYear'])
            count = int(float(row['IndividualCount']))

            populations[year][engine_key] += count

    # Format into the final JSON structure
    output_data = []
    for year in sorted(populations.keys()):
        output_data.append({
            "year": year,
            "counts": dict(populations[year])
        })

    with output_path.open('w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2)

    print(f"✅ Success! Created {output_path}")
    print("Detected fish keys:", list(set(unique_fish_map.values())))

# Run it
transform_csv('../../../data/coral.csv', 'populations.json')