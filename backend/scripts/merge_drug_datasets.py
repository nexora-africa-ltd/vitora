#!/usr/bin/env python
"""
KEML + Kenya Medicine Dataset Merger

Merges:
1. KEML 2023 (essential medicines with LOU, categories)
2. medicine_kenya.csv (brand names, manufacturers, forms, strengths)

Output: drug_catalog.csv aligned with Drug model in sprint-1.3-1.4-track-a-pharmacy-deliverables.md
"""

import csv
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Optional


# Drug form mapping (normalize to Drug model choices)
FORM_MAPPING = {
    # Tablets/Capsules
    'tablet': 'TABLET',
    'tabs': 'TABLET',
    'tab': 'TABLET',
    'tablet (scored)': 'TABLET',
    'tablet (chewable)': 'TABLET',
    'tablet (chewable, dispersible)': 'TABLET',
    'tablet (dispersible, scored)': 'TABLET',
    'tablet (dispersible)': 'TABLET',
    'tablet / capsule': 'TABLET',
    'capsule': 'CAPSULE',
    'caps': 'CAPSULE',
    'cap': 'CAPSULE',
    'capsules': 'CAPSULE',
    # Injections
    'injection': 'INJECTION',
    'inj': 'INJECTION',
    'injection (im/iv)': 'INJECTION',
    'injection (preservative-free)': 'INJECTION',
    'pfi': 'INJECTION',  # Powder for injection
    'pfol': 'INJECTION',  # Powder for oral liquid
    'solution for iv infusion': 'INJECTION',
    'iv infusion': 'INJECTION',
    # Syrups/Liquids
    'syrup': 'SYRUP',
    'syp': 'SYRUP',
    'oral liquid': 'SYRUP',
    'oral solution': 'SYRUP',
    'liquid': 'SYRUP',
    'elixir': 'SYRUP',
    'suspension': 'SUSPENSION',
    'susp': 'SUSPENSION',
    'emulsion': 'SUSPENSION',
    # Topicals
    'cream': 'CREAM',
    'ointment': 'OINTMENT',
    'oint': 'OINTMENT',
    'gel': 'GEL',
    'lotion': 'CREAM',
    'paste': 'OINTMENT',
    # Inhalers
    'inhaler': 'INHALER',
    'inhalation': 'INHALER',
    'inhalation (medical gas)': 'INHALER',
    'nebulizer': 'INHALER',
    'nasal spray': 'SPRAY',
    'spray': 'SPRAY',
    'topical spray': 'SPRAY',
    # Eye/Ear
    'solution (eye-drops)': 'DROPS',
    'eye drops': 'DROPS',
    'eye oint': 'OINTMENT',
    'e/e drops': 'DROPS',
    'drops': 'DROPS',
    # Others
    'powder': 'POWDER',
    'granules': 'POWDER',
    'patch': 'PATCH',
    'pessary': 'OTHER',
    'pess': 'OTHER',
    'suppository': 'OTHER',
    'dental cartridge': 'INJECTION',
    'implant': 'OTHER',
    'device': 'OTHER',
}

# Category mapping from medicine_kenya.csv Class to Drug model categories
CLASS_TO_CATEGORY = {
    # Analgesics
    'nsaids': 'ANALGESIC',
    'analgesics': 'ANALGESIC',
    'non-opioid analgesics': 'ANALGESIC',
    'opioid analgesics': 'CONTROLLED',
    # Antibiotics
    'antibacterials': 'ANTIBIOTIC',
    'anti-infectives': 'ANTIBIOTIC',
    'cephalosporins': 'ANTIBIOTIC',
    'penicillins': 'ANTIBIOTIC',
    'macrolides': 'ANTIBIOTIC',
    'floroquinolones': 'ANTIBIOTIC',
    'aminoglycoside': 'ANTIBIOTIC',
    'tetracyclines': 'ANTIBIOTIC',
    # Antimalarials
    'antimalarials': 'ANTIMALARIAL',
    # Antivirals/ARVs
    'antiviral': 'ANTIRETROVIRAL',
    'antiretroviral': 'ANTIRETROVIRAL',
    # Cardiovascular
    'cardiovascular': 'ANTIHYPERTENSIVE',
    'antihypertensive': 'ANTIHYPERTENSIVE',
    'ace inhibitors': 'ANTIHYPERTENSIVE',
    'beta-blockers': 'ANTIHYPERTENSIVE',
    'calcium channel': 'ANTIHYPERTENSIVE',
    'diuretics': 'ANTIHYPERTENSIVE',
    # Antidiabetics
    'antidiabetics': 'ANTIDIABETIC',
    'antidiabetic': 'ANTIDIABETIC',
    'insulins': 'ANTIDIABETIC',
    # Antihistamines
    'antihistamines': 'ANTIHISTAMINE',
    'antihistamine': 'ANTIHISTAMINE',
    # Psychotropics
    'cns agents': 'PSYCHOTROPIC',
    'psychotropic': 'PSYCHOTROPIC',
    'antidepressants': 'PSYCHOTROPIC',
    'antipsychotics': 'PSYCHOTROPIC',
    'anxiolytics': 'PSYCHOTROPIC',
    'anticonvulsants': 'PSYCHOTROPIC',
    'general anaesthetics': 'PSYCHOTROPIC',
    # Vaccines
    'immunological': 'VACCINE',
    'vaccines': 'VACCINE',
    # Vitamins
    'vitamins': 'VITAMIN',
    'minerals': 'VITAMIN',
    'nutrition': 'VITAMIN',
    # Contraceptives
    'contraceptives': 'CONTRACEPTIVE',
    'hormonal contraceptives': 'CONTRACEPTIVE',
    # Controlled
    'controlled': 'CONTROLLED',
    'narcotics': 'CONTROLLED',
    # Antifungals/Others
    'antifungals': 'OTHER',
    'anthelmintics': 'OTHER',
    'gastrointestinal': 'OTHER',
    'respiratory': 'OTHER',
    'dermatological': 'OTHER',
    'corticosteroids': 'OTHER',
    'oncology': 'OTHER',
    'misc': 'OTHER',
}

# KEML subcategory to Drug category mapping
KEML_SUBCAT_TO_CATEGORY = {
    '1.1': 'PSYCHOTROPIC',  # General Anaesthetics
    '1.2': 'PSYCHOTROPIC',  # Local Anaesthetics
    '1.3': 'PSYCHOTROPIC',  # Pre-operative
    '1.4': 'OTHER',         # Medical gases
    '2.': 'PSYCHOTROPIC',   # Muscle relaxants
    '3.': 'ANALGESIC',      # Analgesics
    '5.': 'OTHER',          # Antiallergics
    '6.': 'ANTICONVULSANT', # Anticonvulsants
    '7.1': 'OTHER',         # Anthelminthics
    '7.2': 'ANTIBIOTIC',    # Antibacterials
    '7.3': 'OTHER',         # Antifungals
    '7.4': 'ANTIRETROVIRAL',# Antivirals
    '7.5': 'ANTIMALARIAL',  # Antiprotozoal
    '9.': 'OTHER',          # Antineoplastics
    '12.': 'OTHER',         # Blood medicines
    '13.': 'OTHER',         # Plasma derived
    '14.': 'ANTIHYPERTENSIVE', # Cardiovascular
    '18.': 'OTHER',         # Diuretics
    '20.': 'ANTIDIABETIC',  # Diabetes
    '21.': 'VACCINE',       # Vaccines
    '23.': 'CONTRACEPTIVE', # Contraceptives
    '25.': 'PSYCHOTROPIC',  # Psychotropics
    '26.': 'OTHER',         # Respiratory
    '28.': 'OTHER',         # Gout
    '31.': 'VITAMIN',       # Nutrition
    '33.': 'OTHER',         # Feeds
}

# Controlled substance indicators
CONTROLLED_INDICATORS = [
    'morphine', 'fentanyl', 'pethidine', 'codeine', 'tramadol',
    'diazepam', 'lorazepam', 'midazolam', 'phenobarbital',
    'ketamine', 'buprenorphine', 'methadone',
]

# Schedule determination based on drug characteristics
def determine_schedule(generic_name: str, is_controlled: bool, requires_prescription: bool) -> str:
    """Determine drug schedule (OTC, POM, P, CD)."""
    name_lower = generic_name.lower()
    
    # Controlled drugs
    if is_controlled or any(ctrl in name_lower for ctrl in CONTROLLED_INDICATORS):
        return 'CD'
    
    # OTC common drugs
    otc_drugs = ['paracetamol', 'ibuprofen', 'aspirin', 'antacid', 'vitamin', 
                 'loratadine', 'cetirizine', 'oral rehydration']
    if any(otc in name_lower for otc in otc_drugs) and not requires_prescription:
        return 'OTC'
    
    # Most drugs are POM by default
    return 'POM'


def normalize_form(form_raw: str) -> str:
    """Normalize dose form to Drug model choices."""
    if not form_raw:
        return 'OTHER'
    form_lower = form_raw.strip().lower()
    
    # Direct mapping
    if form_lower in FORM_MAPPING:
        return FORM_MAPPING[form_lower]
    
    # Partial match
    for key, value in FORM_MAPPING.items():
        if key in form_lower:
            return value
    
    return 'OTHER'


def normalize_category(class_raw: str, keml_subcat: str = '') -> str:
    """Normalize drug class/category to Drug model choices."""
    if not class_raw and not keml_subcat:
        return 'OTHER'
    
    # Try KEML subcategory first
    if keml_subcat:
        for prefix, category in KEML_SUBCAT_TO_CATEGORY.items():
            if keml_subcat.startswith(prefix):
                return category
    
    # Try class from medicine_kenya
    if class_raw:
        class_lower = class_raw.strip().lower()
        for key, value in CLASS_TO_CATEGORY.items():
            if key in class_lower:
                return value
    
    return 'OTHER'


def clean_generic_name(name: str) -> str:
    """Clean and normalize generic name."""
    if not name:
        return ''
    # Remove footnote numbers
    name = re.sub(r'\d+$', '', name).strip()
    # Normalize case
    name = name.strip().title()
    # Handle common variations
    name = name.replace('Hydrochloride', 'HCl').replace('Sulphate', 'Sulfate')
    return name


def clean_strength(strength: str) -> str:
    """Clean and normalize strength."""
    if not strength:
        return ''
    # Remove multi-line artifacts
    strength = ' '.join(strength.split())
    return strength.strip()


def generate_drug_code(generic_name: str, strength: str, form: str, counter: dict) -> str:
    """Generate unique drug code."""
    # Create base from generic name
    base = re.sub(r'[^a-zA-Z0-9]', '', generic_name.upper())[:6]
    if not base:
        base = 'DRUG'
    
    # Increment global counter for this base
    counter[base] = counter.get(base, 0) + 1
    
    return f"DRG-{base}-{counter[base]:04d}"


def load_keml(filepath: Path) -> dict:
    """Load KEML 2023 data."""
    drugs = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = clean_generic_name(row.get('name', ''))
            if not name:
                continue
            
            key = name.lower()
            if key not in drugs:
                drugs[key] = {
                    'keml_code': row.get('code', ''),
                    'generic_name': name,
                    'form': normalize_form(row.get('dose_form', '')),
                    'strength': clean_strength(row.get('strength', '')),
                    'lou': row.get('lou', ''),
                    'category': row.get('category', ''),
                    'subcategory': row.get('subcategory', ''),
                    'is_essential': True,
                    'brands': [],
                    'manufacturers': set(),
                    'forms': {normalize_form(row.get('dose_form', ''))},
                    'strengths': {clean_strength(row.get('strength', ''))},
                }
            else:
                # Add additional forms/strengths
                drugs[key]['forms'].add(normalize_form(row.get('dose_form', '')))
                drugs[key]['strengths'].add(clean_strength(row.get('strength', '')))
    
    return drugs


def load_medicine_kenya(filepath: Path) -> dict:
    """Load medicine_kenya.csv data."""
    drugs = defaultdict(lambda: {
        'brands': [],
        'manufacturers': set(),
        'forms': set(),
        'strengths': set(),
        'classes': set(),
    })
    
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            generic = row.get('Generic Name', '').strip()
            if not generic or generic == '(n/a)':
                continue
            
            key = clean_generic_name(generic).lower()
            brand = row.get('\ufeffBrand Name', row.get('Brand Name', '')).strip()
            
            if brand and brand not in drugs[key]['brands']:
                drugs[key]['brands'].append(brand)
            
            mfg = row.get('Manufacturer', '').strip()
            if mfg:
                drugs[key]['manufacturers'].add(mfg)
            
            form = normalize_form(row.get('Form', ''))
            if form:
                drugs[key]['forms'].add(form)
            
            strength = clean_strength(row.get('Strength', ''))
            if strength:
                drugs[key]['strengths'].add(strength)
            
            drug_class = row.get('Class', '').strip()
            if drug_class:
                drugs[key]['classes'].add(drug_class)
    
    return drugs


def merge_datasets(keml: dict, market: dict) -> list:
    """Merge KEML and market datasets into unified drug catalog."""
    catalog = []
    code_counter = {}
    seen_drugs = set()
    
    # First pass: KEML drugs (essential)
    for key, keml_data in keml.items():
        market_data = market.get(key, {})
        
        # Combine brands from market data
        brands = list(set(keml_data.get('brands', []) + market_data.get('brands', [])))[:20]
        manufacturers = list(keml_data.get('manufacturers', set()) | market_data.get('manufacturers', set()))[:10]
        
        # Get all form/strength combinations
        forms = keml_data.get('forms', set()) | market_data.get('forms', set())
        strengths = keml_data.get('strengths', set()) | market_data.get('strengths', set())
        
        # Create entry for primary form/strength
        primary_form = keml_data.get('form', 'OTHER')
        primary_strength = keml_data.get('strength', '')
        
        # Determine category
        category = normalize_category(
            list(market_data.get('classes', set()))[0] if market_data.get('classes') else '',
            keml_data.get('subcategory', '')
        )
        
        # Check if controlled
        is_controlled = any(ctrl in key for ctrl in CONTROLLED_INDICATORS)
        
        # Determine if requires prescription based on LOU
        lou = keml_data.get('lou', '')
        requires_rx = lou not in ['1', '2'] if lou else True
        
        drug_key = f"{key}_{primary_strength}_{primary_form}"
        if drug_key in seen_drugs:
            continue
        seen_drugs.add(drug_key)
        
        entry = {
            'code': generate_drug_code(keml_data['generic_name'], primary_strength, primary_form, code_counter),
            'generic_name': keml_data['generic_name'],
            'brand_names': json.dumps(brands[:10]),
            'category': category,
            'form': primary_form,
            'strength': primary_strength,
            'unit': get_unit_for_form(primary_form),
            'schedule': determine_schedule(keml_data['generic_name'], is_controlled, requires_rx),
            'requires_prescription': requires_rx,
            'is_controlled': is_controlled,
            'is_narcotic': 'morphine' in key or 'fentanyl' in key or 'pethidine' in key,
            'keml_code': keml_data.get('keml_code', ''),
            'is_essential': True,
            'nhif_code': '',  # Would need NHIF data
            'default_reorder_level': get_default_reorder_level(category, lou),
            'default_reorder_quantity': get_default_reorder_quantity(category),
            'storage_requirements': get_storage_requirements(key, primary_form),
            'reference_price': '',  # Would need pricing data
            'is_active': True,
            'manufacturers': json.dumps(manufacturers[:5]),
            'lou': lou,
        }
        catalog.append(entry)
        
        # Add additional strength/form variants if significantly different
        for strength in strengths:
            if strength and strength != primary_strength:
                for form in forms:
                    if form and form != 'OTHER':
                        var_key = f"{key}_{strength}_{form}"
                        if var_key in seen_drugs:
                            continue
                        seen_drugs.add(var_key)
                        
                        var_entry = entry.copy()
                        var_entry['code'] = generate_drug_code(keml_data['generic_name'], strength, form, code_counter)
                        var_entry['strength'] = strength
                        var_entry['form'] = form
                        var_entry['unit'] = get_unit_for_form(form)
                        catalog.append(var_entry)
    
    # Second pass: Non-KEML drugs from market data
    for key, market_data in market.items():
        if key in keml:
            continue  # Already processed
        
        brands = market_data.get('brands', [])[:10]
        if not brands:
            continue
        
        manufacturers = list(market_data.get('manufacturers', set()))[:5]
        forms = list(market_data.get('forms', set()))
        strengths = list(market_data.get('strengths', set()))
        classes = list(market_data.get('classes', set()))
        
        primary_form = forms[0] if forms else 'OTHER'
        primary_strength = strengths[0] if strengths else ''
        
        generic_name = clean_generic_name(key)
        if not generic_name:
            continue
        
        category = normalize_category(classes[0] if classes else '', '')
        is_controlled = any(ctrl in key for ctrl in CONTROLLED_INDICATORS)
        
        drug_key = f"{key}_{primary_strength}_{primary_form}"
        if drug_key in seen_drugs:
            continue
        seen_drugs.add(drug_key)
        
        entry = {
            'code': generate_drug_code(generic_name, primary_strength, primary_form, code_counter),
            'generic_name': generic_name,
            'brand_names': json.dumps(brands),
            'category': category,
            'form': primary_form,
            'strength': primary_strength,
            'unit': get_unit_for_form(primary_form),
            'schedule': determine_schedule(generic_name, is_controlled, True),
            'requires_prescription': True,
            'is_controlled': is_controlled,
            'is_narcotic': 'morphine' in key or 'fentanyl' in key,
            'keml_code': '',
            'is_essential': False,  # Not on KEML
            'nhif_code': '',
            'default_reorder_level': get_default_reorder_level(category, ''),
            'default_reorder_quantity': get_default_reorder_quantity(category),
            'storage_requirements': get_storage_requirements(key, primary_form),
            'reference_price': '',
            'is_active': True,
            'manufacturers': json.dumps(manufacturers),
            'lou': '',
        }
        catalog.append(entry)
    
    return catalog


def get_unit_for_form(form: str) -> str:
    """Get default unit based on dose form."""
    unit_map = {
        'TABLET': 'tablet',
        'CAPSULE': 'capsule',
        'INJECTION': 'vial',
        'SYRUP': 'ml',
        'SUSPENSION': 'ml',
        'CREAM': 'g',
        'OINTMENT': 'g',
        'GEL': 'g',
        'DROPS': 'ml',
        'INHALER': 'dose',
        'SPRAY': 'dose',
        'POWDER': 'g',
        'PATCH': 'patch',
    }
    return unit_map.get(form, 'unit')


def get_default_reorder_level(category: str, lou: str) -> int:
    """Get default reorder level based on category and LOU."""
    # Higher for commonly used drugs
    if lou in ['1', '2']:
        base = 100
    elif lou in ['3', '4']:
        base = 50
    else:
        base = 25
    
    # Adjust by category
    if category in ['ANTIBIOTIC', 'ANALGESIC', 'ANTIMALARIAL']:
        return base * 2
    elif category in ['VACCINE', 'CONTROLLED']:
        return base // 2
    
    return base


def get_default_reorder_quantity(category: str) -> int:
    """Get default reorder quantity based on category."""
    if category in ['ANTIBIOTIC', 'ANALGESIC', 'ANTIMALARIAL']:
        return 200
    elif category in ['VACCINE', 'CONTROLLED']:
        return 50
    return 100


def get_storage_requirements(generic_name: str, form: str) -> str:
    """Get storage requirements based on drug characteristics."""
    name_lower = generic_name.lower()
    
    # Cold chain drugs
    cold_chain = ['insulin', 'vaccine', 'oxytocin', 'ergometrine', 'immunoglobulin']
    if any(drug in name_lower for drug in cold_chain):
        return 'Refrigerate 2-8°C. Do not freeze.'
    
    # Light sensitive
    if 'nifedipine' in name_lower or 'metronidazole' in name_lower:
        return 'Store below 25°C. Protect from light.'
    
    # Injections often need special handling
    if form == 'INJECTION':
        return 'Store below 25°C. Protect from light.'
    
    return 'Store below 25°C in dry place.'


def main():
    """Main entry point."""
    base_dir = Path(__file__).parent.parent.parent
    
    keml_path = base_dir / 'backend' / 'data' / 'keml_2023.csv'
    market_path = base_dir / '.tmp' / 'medicine_kenya.csv'
    output_path = base_dir / 'backend' / 'data' / 'drug_catalog.csv'
    
    print("=" * 60)
    print("Drug Catalog Generator")
    print("=" * 60)
    print(f"KEML source: {keml_path}")
    print(f"Market source: {market_path}")
    print(f"Output: {output_path}")
    print()
    
    # Load datasets
    print("Loading KEML 2023...")
    keml = load_keml(keml_path)
    print(f"  Loaded {len(keml)} unique generic medicines")
    
    print("Loading medicine_kenya.csv...")
    market = load_medicine_kenya(market_path)
    print(f"  Loaded {len(market)} unique generic medicines")
    
    # Merge
    print("\nMerging datasets...")
    catalog = merge_datasets(keml, market)
    print(f"  Generated {len(catalog)} drug catalog entries")
    
    # Count essential vs non-essential
    essential = sum(1 for d in catalog if d['is_essential'])
    non_essential = len(catalog) - essential
    print(f"  Essential (KEML): {essential}")
    print(f"  Non-essential: {non_essential}")
    
    # Write output
    print(f"\nWriting to {output_path}...")
    fieldnames = [
        'code', 'generic_name', 'brand_names', 'category', 'form', 'strength',
        'unit', 'schedule', 'requires_prescription', 'is_controlled', 'is_narcotic',
        'keml_code', 'is_essential', 'nhif_code', 'default_reorder_level',
        'default_reorder_quantity', 'storage_requirements', 'reference_price',
        'is_active', 'manufacturers', 'lou'
    ]
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        # Sort by essential first, then by generic name
        catalog.sort(key=lambda x: (not x['is_essential'], x['generic_name'].lower()))
        writer.writerows(catalog)
    
    print("\n" + "=" * 60)
    print("COMPLETE")
    print("=" * 60)
    print(f"Output: {output_path}")
    
    # Summary by category
    from collections import Counter
    categories = Counter(d['category'] for d in catalog)
    print("\nBy Category:")
    for cat, count in categories.most_common():
        print(f"  {count:5d} - {cat}")


if __name__ == "__main__":
    main()
