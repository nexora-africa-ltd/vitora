#!/usr/bin/env python
"""
KEML 2023 PDF Extractor

Extracts Kenya Essential Medicines List from the official MOH PDF.
Outputs structured CSV for import into Vitora HMIS.
"""

import csv
import re
import pdfplumber
from pathlib import Path


def extract_keml_from_pdf(pdf_path: str, output_path: str) -> dict:
    """
    Extract medicines from KEML 2023 PDF.
    
    Returns:
        dict with statistics about extraction
    """
    medicines = []
    current_category = ""
    current_subcategory = ""
    current_sub_subcategory = ""
    
    # Regex patterns
    category_pattern = re.compile(r'^(\d+)[.\s]+([A-Z][A-Z\s,&\-]+)$')
    subcategory_pattern = re.compile(r'^(\d+\.\d+)\s+(.+)$')
    sub_subcategory_pattern = re.compile(r'^(\d+\.\d+\.\d+)\s+(.+)$')
    medicine_code_pattern = re.compile(r'^(\d+\.\d+\.\d+\.\d+)$')
    
    stats = {
        'total_pages': 0,
        'total_medicines': 0,
        'categories': set(),
        'errors': []
    }
    
    with pdfplumber.open(pdf_path) as pdf:
        stats['total_pages'] = len(pdf.pages)
        
        for page_num, page in enumerate(pdf.pages, 1):
            # Extract tables from page
            tables = page.extract_tables()
            
            for table in tables:
                if not table:
                    continue
                    
                for row in table:
                    if not row or all(cell is None or cell.strip() == '' for cell in row if cell):
                        continue
                    
                    # Clean row data
                    row = [cell.strip() if cell else '' for cell in row]
                    
                    # Skip header rows
                    if row[0] == '#' or 'Name of Medicine' in str(row):
                        continue
                    
                    # Check for category headers (e.g., "1. ANAESTHETICS...")
                    first_cell = row[0] if row[0] else ''
                    combined_text = ' '.join([c for c in row if c]).strip()
                    
                    # Check for main category (1. ANAESTHETICS...)
                    cat_match = category_pattern.match(combined_text)
                    if cat_match:
                        current_category = f"{cat_match.group(1)}. {cat_match.group(2).strip()}"
                        stats['categories'].add(current_category)
                        current_subcategory = ""
                        current_sub_subcategory = ""
                        continue
                    
                    # Check for subcategory (1.1 General Anaesthetics)
                    subcat_match = subcategory_pattern.match(combined_text)
                    if subcat_match and not medicine_code_pattern.match(first_cell):
                        current_subcategory = f"{subcat_match.group(1)} {subcat_match.group(2).strip()}"
                        current_sub_subcategory = ""
                        continue
                    
                    # Check for sub-subcategory (1.1.1 Inhalational medicines)
                    sub_subcat_match = sub_subcategory_pattern.match(combined_text)
                    if sub_subcat_match and not medicine_code_pattern.match(first_cell):
                        current_sub_subcategory = f"{sub_subcat_match.group(1)} {sub_subcat_match.group(2).strip()}"
                        continue
                    
                    # Check if this is a medicine row (has a code like 1.1.1.1)
                    if len(row) >= 5 and medicine_code_pattern.match(first_cell):
                        code = row[0]
                        name = row[1] if len(row) > 1 else ''
                        dose_form = row[2] if len(row) > 2 else ''
                        strength = row[3] if len(row) > 3 else ''
                        lou = row[4] if len(row) > 4 else ''
                        
                        # Extract footnote numbers from name
                        footnotes = ''
                        footnote_match = re.search(r'(\d+(?:,\s*\d+)*)$', name)
                        if footnote_match:
                            footnotes = footnote_match.group(1)
                            # Don't strip footnotes from name - keep original
                        
                        # Clean up superscript characters in name
                        name_clean = re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]+', '', name).strip()
                        
                        medicine = {
                            'code': code,
                            'name': name_clean,
                            'name_original': name,
                            'dose_form': dose_form,
                            'strength': strength,
                            'lou': lou,
                            'category': current_category,
                            'subcategory': current_subcategory,
                            'sub_subcategory': current_sub_subcategory,
                            'footnotes': footnotes,
                            'page': page_num
                        }
                        medicines.append(medicine)
                        stats['total_medicines'] += 1
            
            # Also try to extract text for categories that might not be in tables
            text = page.extract_text()
            if text:
                for line in text.split('\n'):
                    line = line.strip()
                    # Check for main categories in text
                    cat_match = category_pattern.match(line)
                    if cat_match:
                        current_category = f"{cat_match.group(1)}. {cat_match.group(2).strip()}"
                        stats['categories'].add(current_category)
    
    # Write to CSV
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        fieldnames = [
            'code', 'name', 'dose_form', 'strength', 'lou',
            'category', 'subcategory', 'sub_subcategory', 
            'footnotes', 'name_original', 'page'
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(medicines)
    
    stats['categories'] = list(stats['categories'])
    return stats


def main():
    """Main entry point."""
    # PDF is in project root .tmp, not backend/.tmp
    pdf_path = Path(__file__).parent.parent.parent / ".tmp" / "KEMSA -Kenya Essential Medicines List 2023 (2).pdf"
    output_path = Path(__file__).parent.parent.parent / ".tmp" / "keml_2023_extracted.csv"
    
    print(f"Extracting KEML from: {pdf_path}")
    print(f"Output will be saved to: {output_path}")
    
    if not pdf_path.exists():
        print(f"ERROR: PDF file not found at {pdf_path}")
        return
    
    stats = extract_keml_from_pdf(str(pdf_path), str(output_path))
    
    print(f"\n=== Extraction Complete ===")
    print(f"Total pages processed: {stats['total_pages']}")
    print(f"Total medicines extracted: {stats['total_medicines']}")
    print(f"Categories found: {len(stats['categories'])}")
    print(f"\nCategories:")
    for cat in sorted(stats['categories']):
        print(f"  - {cat}")
    print(f"\nOutput saved to: {output_path}")


if __name__ == "__main__":
    main()
