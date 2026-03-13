"""
Management command to seed common SNOMED CT concepts for offline search.

Seeds a curated set of frequently used clinical findings, disorders, and
procedures for local SNOMED CT search when the Snowstorm API is unavailable.
"""

from django.core.management.base import BaseCommand

from hmis.apps.core.models import SNOMEDConcept

# Common clinical concepts used in Kenyan healthcare facilities
COMMON_CONCEPTS = [
    # Common disorders
    ("38341003", "Hypertensive disorder", "disorder"),
    ("73211009", "Diabetes mellitus", "disorder"),
    ("44054006", "Type 2 diabetes mellitus", "disorder"),
    ("46635009", "Type 1 diabetes mellitus", "disorder"),
    ("195967001", "Asthma", "disorder"),
    ("13645005", "Chronic obstructive lung disease", "disorder"),
    ("56265001", "Heart disease", "disorder"),
    ("22298006", "Myocardial infarction", "disorder"),
    ("230690007", "Cerebrovascular accident", "disorder"),
    ("709044004", "Chronic kidney disease", "disorder"),
    ("363346000", "Malignant neoplastic disease", "disorder"),
    ("40055000", "Chronic sinusitis", "disorder"),
    ("35489007", "Depressive disorder", "disorder"),
    ("197480006", "Anxiety disorder", "disorder"),
    ("58150001", "Fracture of bone", "disorder"),
    ("128613002", "Seizure disorder", "disorder"),
    ("68566005", "Urinary tract infection", "disorder"),
    ("10625991000119109", "Pneumonia", "disorder"),
    ("36971009", "Sinusitis", "disorder"),
    ("43878008", "Streptococcal sore throat", "disorder"),
    # Infectious diseases (common in Kenya)
    ("61462000", "Malaria", "disorder"),
    ("56717001", "Tuberculosis", "disorder"),
    ("186747009", "Cholera", "disorder"),
    ("4834000", "Typhoid fever", "disorder"),
    ("111852003", "Dysentery", "disorder"),
    ("840539006", "COVID-19", "disorder"),
    ("86406008", "Human immunodeficiency virus infection", "disorder"),
    ("66071002", "Hepatitis type B", "disorder"),
    ("235869004", "Hepatitis C", "disorder"),
    ("398102009", "Acute poliomyelitis", "disorder"),
    ("27836007", "Pertussis", "disorder"),
    ("14189004", "Measles", "disorder"),
    ("38907003", "Varicella", "disorder"),
    ("76902006", "Tetanus", "disorder"),
    ("409498004", "Anthrax", "disorder"),
    ("71186008", "Meningococcal meningitis", "disorder"),
    ("186431008", "Clostridioides difficile infection", "disorder"),
    ("75702008", "Brucellosis", "disorder"),
    ("4740000", "Herpes zoster", "disorder"),
    # Maternal health
    ("77386006", "Pregnancy", "finding"),
    ("17382005", "Pre-eclampsia", "disorder"),
    ("15938005", "Eclampsia", "disorder"),
    ("11687002", "Gestational diabetes mellitus", "disorder"),
    ("69217004", "Premature labour", "finding"),
    ("17860005", "Normal delivery procedure", "procedure"),
    ("11466000", "Caesarean section", "procedure"),
    ("56620000", "Delivery procedure", "procedure"),
    ("237240001", "Pregnacy-induced hypertension", "disorder"),
    # Pediatric conditions
    ("387712008", "Neonatal jaundice", "disorder"),
    ("276504007", "Neonatal respiratory distress", "disorder"),
    ("70153002", "Haemorrhagic disease of newborn", "disorder"),
    ("414916001", "Obesity", "disorder"),
    ("238131007", "Overweight", "finding"),
    ("248342006", "Underweight", "finding"),
    ("302872003", "Malnutrition", "disorder"),
    ("190905008", "Kwashiorkor", "disorder"),
    ("70241007", "Nutritional marasmus", "disorder"),
    # Common findings & symptoms
    ("386661006", "Fever", "finding"),
    ("25064002", "Headache", "finding"),
    ("21522001", "Abdominal pain", "finding"),
    ("29857009", "Chest pain", "finding"),
    ("49727002", "Cough", "finding"),
    ("267036007", "Dyspnoea", "finding"),
    ("62315008", "Diarrhoea", "finding"),
    ("422587007", "Nausea", "finding"),
    ("422400008", "Vomiting", "finding"),
    ("271807003", "Eruption of skin", "finding"),
    ("182888003", "Fatigue", "finding"),
    ("404640003", "Dizziness", "finding"),
    ("271594007", "Syncope", "finding"),
    ("3006004", "Disturbance of consciousness", "finding"),
    ("22253000", "Pain", "finding"),
    ("161891005", "Backache", "finding"),
    ("57676002", "Joint pain", "finding"),
    ("81680005", "Neck pain", "finding"),
    ("267102003", "Sore throat", "finding"),
    ("64531003", "Nasal discharge", "finding"),
    ("247472004", "Wheezing", "finding"),
    ("60862001", "Tinnitus", "finding"),
    ("23924001", "Tight chest", "finding"),
    ("73595000", "Stress", "finding"),
    ("82991003", "Generalized aches and pains", "finding"),
    # Common procedures
    ("387713003", "Surgical procedure", "procedure"),
    ("71388002", "Procedure", "procedure"),
    ("108241001", "Dialysis procedure", "procedure"),
    ("33195004", "Blood transfusion", "procedure"),
    ("18949003", "Change of dressing", "procedure"),
    ("174041007", "Appendectomy", "procedure"),
    ("36969009", "Placement of stent", "procedure"),
    ("363680008", "Radiographic imaging procedure", "procedure"),
    ("77477000", "Computerized axial tomography", "procedure"),
    ("113091000", "Magnetic resonance imaging", "procedure"),
    ("40701008", "Echocardiography", "procedure"),
    ("252416005", "Histopathology test", "procedure"),
    # Allergies / substances
    ("91936005", "Allergy to penicillin", "finding"),
    ("294505008", "Allergy to sulfonamide", "finding"),
    ("213020009", "Allergy to egg", "finding"),
    ("91935009", "Allergy to peanut", "finding"),
    ("419511003", "Drug allergy", "finding"),
    ("418038007", "Propensity to adverse reactions to substance", "finding"),
    # Vital sign observations
    ("271649006", "Systolic blood pressure", "observable entity"),
    ("271650006", "Diastolic blood pressure", "observable entity"),
    ("364075005", "Heart rate", "observable entity"),
    ("86290005", "Respiratory rate", "observable entity"),
    ("386725007", "Body temperature", "observable entity"),
    ("431314004", "SpO2 - Loss of oxygen saturation", "observable entity"),
    ("27113001", "Body weight", "observable entity"),
    ("50373000", "Body height measure", "observable entity"),
]


class Command(BaseCommand):
    help = "Seed common SNOMED CT concepts for offline search"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be seeded without writing to the database",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        created_count = 0
        updated_count = 0

        for concept_id, display, semantic_tag in COMMON_CONCEPTS:
            if dry_run:
                exists = SNOMEDConcept.objects.filter(concept_id=concept_id).exists()
                action = "EXISTS" if exists else "CREATE"
                self.stdout.write(f"  [{action}] {concept_id} | {display} ({semantic_tag})")
                if not exists:
                    created_count += 1
                continue

            _, created = SNOMEDConcept.objects.update_or_create(
                concept_id=concept_id,
                defaults={
                    "display": display,
                    "semantic_tag": semantic_tag,
                    "is_active": True,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        if dry_run:
            self.stdout.write(
                self.style.WARNING(f"\n[DRY RUN] Would create {created_count} new concepts")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"\nSeeded SNOMED CT concepts: {created_count} created, "
                    f"{updated_count} updated, {len(COMMON_CONCEPTS)} total"
                )
            )
