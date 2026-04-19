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
    
    for entry in sorted(populations, key=lambda x: x['year']):
        year = entry['year']
        counts = entry['counts']
        total = sum(counts.values())
        
        if prev_total is not None:
            # Significant overall drop
            if total < prev_total * 0.7:
                warnings.append({
                    "year": year, 
                    "message": f"ALERT: Major decline in overall fish biomass detected. System instability rising."
                })
            
            # Specific species crashes
            for species_id, count in prev_counts.items():
                if species_id in counts:
                    new_count = counts[species_id]
                    if new_count < count * 0.3 and count > 50: # Only report if it was significant before
                        name = fish_names.get(species_id, species_id).upper()
                        warnings.append({
                            "year": year,
                            "message": f"CRITICAL: {name} population has crashed. Habitat loss is likely the cause."
                        })
        
        prev_total = total
        prev_counts = counts

    # 3. Add some filler/intro/outro warnings if needed
    if not any(w['year'] == 2014 for w in warnings):
        warnings.append({"year": 2014, "message": "SYSTEM ONLINE: Environmental sensors active. Beginning multi-year dive sequence."})
    
    if not any(w['year'] == 2026 for w in warnings):
        warnings.append({"year": 2026, "message": "SYSTEM FAILURE: Ecosystem collapse imminent. Eco-vitality at critical levels."})

    # Sort and remove duplicates (keep most severe if multiple for same year)
    warnings.sort(key=lambda x: (x['year'], "CRITICAL" not in x['message']))
    
    # Deduplicate years - keep only the most important warning per year
    final_warnings = []
    seen_years = {}
    for w in warnings:
        year = w['year']
        if year not in seen_years:
            final_warnings.append(w)
            seen_years[year] = len(final_warnings) - 1
        else:
            idx = seen_years[year]
            existing_msg = final_warnings[idx]['message']
            new_msg = w['message']
            
            # If both are critical, merge them cleanly
            if "CRITICAL" in existing_msg and "CRITICAL" in new_msg:
                # Remove the "CRITICAL: " prefix from the new message
                cleaned_new = new_msg.replace("CRITICAL: ", "")
                final_warnings[idx]['message'] += f" ALSO: {cleaned_new}"
            else:
                final_warnings[idx]['message'] += f" | {new_msg}"

    with open('warnings.json', 'w') as f:
        json.dump(final_warnings, f, indent=2)
    
    print(f"✅ warnings.json generated with {len(final_warnings)} entries.")

if __name__ == "__main__":
    generate_warnings()
