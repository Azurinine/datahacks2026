import json
from collections import defaultdict

def generate_warnings():
    try:
        with open('populations.json', 'r') as f:
            populations = json.load(f)
        with open('coral_registry.json', 'r') as f:
            corals = json.load(f)
        with open('fish_metadata.json', 'r') as f:
            fish_meta = json.load(f)
    except FileNotFoundError:
        print("Required data files not found.")
        return

    warnings = []
    
    # 1. Coral Bleaching Warnings
    bleach_events = defaultdict(list)
    for coral in corals:
        if coral.get('bleach_year'):
            bleach_events[coral['bleach_year']].append(coral['name'])
            
    for year in sorted(bleach_events.keys()):
        names = bleach_events[year]
        if len(names) > 3:
            msg = f"CRITICAL: Widespread bleaching observed! {', '.join(names[:3])} and others are dying."
        else:
            msg = f"WARNING: { ' and '.join(names) } reached bleaching threshold. Vitality dropping."
        warnings.append({"year": year, "message": msg})

    # 2. Fish Population Warnings
    # Map IDs to names for better messages
    fish_names = { f['id']: f['name'] for f in fish_meta }
    
    # Calculate totals and track specific species drops
    prev_total = None
    prev_counts = {}
    initial_counts = {}
    reported_extinct = set()
    
    for entry in sorted(populations, key=lambda x: x['year']):
        year = entry['year']
        counts = entry['counts']
        total = sum(counts.values())
        
        if not initial_counts:
            initial_counts = counts.copy()
            
        if prev_total is not None:
            # Significant overall drop
            if total < prev_total * 0.7:
                warnings.append({
                    "year": year, 
                    "message": f"ALERT: Major decline in overall fish biomass detected. System instability rising."
                })
            
            # Specific species crashes
            for species_id, count in counts.items():
                prev = prev_counts.get(species_id, 0)
                name = fish_names.get(species_id, species_id).upper()
                
                # Sudden crash
                if count < prev * 0.3 and prev > 50:
                    warnings.append({
                        "year": year,
                        "message": f"WARNING: {name} population has crashed."
                    })
                
                # Close to extinction (under 15% of initial)
                init_count = initial_counts.get(species_id, 0)
                if init_count > 10 and count < init_count * 0.15 and species_id not in reported_extinct:
                    warnings.append({
                        "year": year,
                        "message": f"CRITICAL: {name} is close to extinction!"
                    })
                    reported_extinct.add(species_id)
        
        prev_total = total
        prev_counts = counts

    # 3. Add some filler/intro/outro warnings if needed
    if not any(w['year'] == 2014 for w in warnings):
        warnings.append({"year": 2014, "message": "SYSTEM ONLINE: Environmental sensors active. Beginning multi-year dive sequence."})
    
    if not any(w['year'] == 2026 for w in warnings):
        warnings.append({"year": 2026, "message": "SYSTEM FAILURE: Ecosystem collapse imminent. Eco-vitality at critical levels."})

    # Sort
    warnings.sort(key=lambda x: (x['year'], "CRITICAL" not in x['message']))

    with open('warnings.json', 'w') as f:
        json.dump(warnings, f, indent=2)
    
    print(f"✅ warnings.json generated with {len(warnings)} entries.")

if __name__ == "__main__":
    generate_warnings()
