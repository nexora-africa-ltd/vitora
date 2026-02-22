"""
Management command to seed MOH 502 notifiable diseases.

Seeds the database with Kenya's Ministry of Health notifiable disease list
including ICD-10 code mappings, reporting categories, and timelines.
"""

from django.core.management.base import BaseCommand

# MOH 502 Notifiable Diseases List with ICD-10 mappings
# Based on Kenya's Public Health Act and MOH guidelines
MOH_502_DISEASES = [
    # IMMEDIATE REPORTABLE DISEASES (within 24 hours)
    {
        "name": "Cholera",
        "icd10_codes": "A00,A00.0,A00.1,A00.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Acute diarrheal disease caused by Vibrio cholerae",
        "case_definition": "A patient aged 2 years or more with acute watery diarrhea with or without vomiting OR any patient with acute watery diarrhea dying within 2 hours of admission",
        "laboratory_criteria": "Isolation of Vibrio cholerae O1 or O139 from stool",
        "is_ihr_notifiable": True,
    },
    {
        "name": "Yellow Fever",
        "icd10_codes": "A95,A95.0,A95.1,A95.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Viral hemorrhagic fever transmitted by mosquitoes",
        "case_definition": "Acute onset of fever followed by jaundice within 2 weeks of onset",
        "laboratory_criteria": "Detection of Yellow Fever virus, antigen, or specific antibodies",
        "is_ihr_notifiable": True,
    },
    {
        "name": "Plague",
        "icd10_codes": "A20,A20.0,A20.1,A20.2,A20.3,A20.7,A20.8,A20.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Bacterial infection caused by Yersinia pestis",
        "case_definition": "Rapid onset of fever, chills, headache, severe malaise with painful lymphadenitis (bubonic) or pneumonia (pneumonic)",
        "laboratory_criteria": "Isolation of Y. pestis or detection of F1 antigen",
        "is_ihr_notifiable": True,
    },
    {
        "name": "Viral Hemorrhagic Fevers",
        "icd10_codes": "A96,A96.0,A96.1,A96.2,A96.8,A96.9,A98,A98.0,A98.1,A98.2,A98.3,A98.4,A98.5,A98.8,A99",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Group of illnesses caused by several families of viruses (Ebola, Marburg, Lassa, etc.)",
        "case_definition": "Acute onset of fever and hemorrhagic manifestations with no known predisposing host factors",
        "laboratory_criteria": "Detection of specific viral antigen or antibodies",
        "is_ihr_notifiable": True,
    },
    {
        "name": "Measles",
        "icd10_codes": "B05,B05.0,B05.1,B05.2,B05.3,B05.4,B05.8,B05.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Highly contagious viral disease",
        "case_definition": "Fever and maculopapular rash with cough, coryza, or conjunctivitis",
        "laboratory_criteria": "Detection of measles-specific IgM antibodies or virus isolation",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Acute Flaccid Paralysis (Polio)",
        "icd10_codes": "A80,A80.0,A80.1,A80.2,A80.3,A80.4,A80.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Any case of acute flaccid paralysis in a child under 15 years",
        "case_definition": "Sudden onset of flaccid paralysis in one or more limbs in a child under 15 years",
        "laboratory_criteria": "Isolation of wild poliovirus from stool",
        "is_ihr_notifiable": True,
    },
    {
        "name": "Meningococcal Meningitis",
        "icd10_codes": "A39,A39.0,A39.1,A39.2,A39.3,A39.4,A39.5,A39.8,A39.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Bacterial meningitis caused by Neisseria meningitidis",
        "case_definition": "Sudden onset of fever, headache, and stiff neck or altered consciousness",
        "laboratory_criteria": "Isolation of N. meningitidis from CSF or blood",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Rabies (Human)",
        "icd10_codes": "A82,A82.0,A82.1,A82.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Viral disease transmitted through bites from infected animals",
        "case_definition": "Acute encephalomyelitis with history of animal bite or exposure",
        "laboratory_criteria": "Detection of rabies viral antigen or isolation of rabies virus",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Diphtheria",
        "icd10_codes": "A36,A36.0,A36.1,A36.2,A36.3,A36.8,A36.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Bacterial infection causing thick membrane in nose and throat",
        "case_definition": "Upper respiratory tract illness with grayish membrane in pharynx, larynx, or tonsils",
        "laboratory_criteria": "Isolation of toxigenic C. diphtheriae from clinical specimen",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Neonatal Tetanus",
        "icd10_codes": "A33",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Tetanus occurring in neonates",
        "case_definition": "Neonate with normal ability to feed in first 2 days then inability to suck plus stiffness or spasms",
        "laboratory_criteria": "Clinical diagnosis (no laboratory confirmation required)",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Pertussis (Whooping Cough)",
        "icd10_codes": "A37,A37.0,A37.1,A37.8,A37.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Highly contagious respiratory disease caused by Bordetella pertussis",
        "case_definition": "Cough illness lasting 2+ weeks with paroxysms of coughing, inspiratory 'whoop', or post-tussive vomiting",
        "laboratory_criteria": "Isolation of B. pertussis or positive PCR",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Anthrax",
        "icd10_codes": "A22,A22.0,A22.1,A22.2,A22.7,A22.8,A22.9",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Bacterial disease caused by Bacillus anthracis",
        "case_definition": "Skin lesion evolving to eschar, or severe respiratory illness, or severe gastroenteritis following exposure to infected animals",
        "laboratory_criteria": "Isolation of B. anthracis from clinical specimen",
        "is_ihr_notifiable": True,
    },
    {
        "name": "SARS/Novel Coronavirus",
        "icd10_codes": "U04,U04.9,U07.1,U07.2",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Severe acute respiratory syndrome caused by novel coronaviruses",
        "case_definition": "Fever plus respiratory symptoms plus epidemiological link",
        "laboratory_criteria": "Detection of SARS-CoV or SARS-CoV-2 by PCR",
        "is_ihr_notifiable": True,
    },
    {
        "name": "Influenza (Novel/Pandemic)",
        "icd10_codes": "J09,J10,J10.0,J10.1,J10.8,J11,J11.0,J11.1,J11.8",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Novel or pandemic influenza strains",
        "case_definition": "Severe acute respiratory illness with fever and epidemiological link",
        "laboratory_criteria": "Detection of novel influenza virus",
        "is_ihr_notifiable": True,
    },
    {
        "name": "Smallpox",
        "icd10_codes": "B03",
        "category": "IMMEDIATE",
        "reporting_hours": 24,
        "description": "Eradicated disease - any suspected case requires immediate reporting",
        "case_definition": "Acute onset of fever followed by characteristic progressive rash",
        "laboratory_criteria": "Identification of variola virus",
        "is_ihr_notifiable": True,
    },
    # WEEKLY REPORTABLE DISEASES (IDSR)
    {
        "name": "Malaria",
        "icd10_codes": "B50,B50.0,B50.8,B50.9,B51,B51.0,B51.8,B51.9,B52,B52.0,B52.8,B52.9,B53,B53.0,B53.1,B53.8,B54",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Parasitic disease transmitted by Anopheles mosquitoes",
        "case_definition": "Fever with or without other symptoms confirmed by microscopy or RDT",
        "laboratory_criteria": "Positive blood smear or RDT for Plasmodium species",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Typhoid Fever",
        "icd10_codes": "A01,A01.0,A01.1,A01.2,A01.3,A01.4",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Bacterial infection caused by Salmonella typhi",
        "case_definition": "Gradual onset of sustained fever with headache, malaise, anorexia, relative bradycardia",
        "laboratory_criteria": "Isolation of S. typhi from blood, stool, or bone marrow",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Dysentery",
        "icd10_codes": "A03,A03.0,A03.1,A03.2,A03.3,A03.8,A03.9,A06,A06.0,A06.1,A06.2",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Bloody diarrhea caused by Shigella or Entamoeba histolytica",
        "case_definition": "Acute diarrhea with blood in stool",
        "laboratory_criteria": "Isolation of Shigella or identification of E. histolytica",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Tuberculosis",
        "icd10_codes": "A15,A15.0,A15.1,A15.2,A15.3,A15.4,A15.5,A15.6,A15.7,A15.8,A15.9,A16,A16.0,A16.1,A16.2,A16.3,A16.4,A16.5,A16.7,A16.8,A16.9,A17,A18,A19",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Bacterial infection caused by Mycobacterium tuberculosis",
        "case_definition": "Cough for more than 2 weeks with or without other symptoms",
        "laboratory_criteria": "Positive sputum smear, culture, or GeneXpert",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Acute Respiratory Infections (ARI)",
        "icd10_codes": "J00,J01,J02,J03,J04,J05,J06,J20,J21,J22",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Acute infections of the respiratory tract",
        "case_definition": "Sudden onset of fever with cough or sore throat",
        "laboratory_criteria": "Clinical diagnosis",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Pneumonia",
        "icd10_codes": "J12,J13,J14,J15,J16,J17,J18",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Lower respiratory tract infection",
        "case_definition": "Cough with fever, fast breathing, and chest indrawing",
        "laboratory_criteria": "Clinical diagnosis with or without chest X-ray",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Diarrhea (Non-Bloody)",
        "icd10_codes": "A09,K52.9",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Acute diarrhea without blood",
        "case_definition": "Three or more loose stools in 24 hours without blood",
        "laboratory_criteria": "Clinical diagnosis",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Leprosy",
        "icd10_codes": "A30,A30.0,A30.1,A30.2,A30.3,A30.4,A30.5,A30.8,A30.9",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Chronic bacterial infection caused by Mycobacterium leprae",
        "case_definition": "Hypopigmented or reddish skin patch with loss of sensation",
        "laboratory_criteria": "Positive skin smear or clinical diagnosis",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Brucellosis",
        "icd10_codes": "A23,A23.0,A23.1,A23.2,A23.3,A23.8,A23.9",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Bacterial zoonotic disease",
        "case_definition": "Acute or insidious onset of fever, sweats, fatigue, with history of animal contact",
        "laboratory_criteria": "Isolation of Brucella species or positive serology",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Tetanus (Non-Neonatal)",
        "icd10_codes": "A34,A35",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Bacterial disease causing muscle stiffness and spasms",
        "case_definition": "Acute onset of hypertonia and/or painful muscular contractions",
        "laboratory_criteria": "Clinical diagnosis",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Hepatitis (Viral)",
        "icd10_codes": "B15,B15.0,B15.9,B16,B16.0,B16.1,B16.2,B16.9,B17,B17.0,B17.1,B17.2,B17.8,B18,B19",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Inflammation of the liver caused by hepatitis viruses",
        "case_definition": "Acute illness with jaundice and elevated liver enzymes",
        "laboratory_criteria": "Positive hepatitis serological markers",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Chikungunya",
        "icd10_codes": "A92.0",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Viral disease transmitted by Aedes mosquitoes",
        "case_definition": "Acute onset of fever and severe joint pain",
        "laboratory_criteria": "Positive PCR or serology for CHIKV",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Dengue Fever",
        "icd10_codes": "A90,A91",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Viral disease transmitted by Aedes mosquitoes",
        "case_definition": "Acute onset of fever with two or more of: headache, retro-orbital pain, myalgia, arthralgia, rash, hemorrhagic manifestations",
        "laboratory_criteria": "Positive NS1 antigen, PCR, or IgM serology",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Rift Valley Fever",
        "icd10_codes": "A92.4",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Viral zoonotic disease affecting humans and livestock",
        "case_definition": "Acute onset of fever with hemorrhagic manifestations, jaundice, or encephalitis with history of animal contact",
        "laboratory_criteria": "Positive PCR or serology for RVF virus",
        "is_ihr_notifiable": True,
    },
    {
        "name": "Trypanosomiasis (Sleeping Sickness)",
        "icd10_codes": "B56,B56.0,B56.1,B56.9",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Parasitic disease caused by Trypanosoma species",
        "case_definition": "Intermittent fever with chancre at bite site, lymphadenopathy, and neurological symptoms",
        "laboratory_criteria": "Identification of trypanosomes in blood, lymph node, or CSF",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Leishmaniasis (Kala-azar)",
        "icd10_codes": "B55,B55.0,B55.1,B55.2,B55.9",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Parasitic disease transmitted by sandflies",
        "case_definition": "Prolonged fever, weight loss, hepatosplenomegaly, and pancytopenia",
        "laboratory_criteria": "Demonstration of parasites in tissue or positive serology",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Schistosomiasis (Bilharzia)",
        "icd10_codes": "B65,B65.0,B65.1,B65.2,B65.3,B65.8,B65.9",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Parasitic disease caused by blood flukes",
        "case_definition": "Presence of blood in urine or stool with history of freshwater contact",
        "laboratory_criteria": "Detection of eggs in urine or stool",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Trachoma",
        "icd10_codes": "A71,A71.0,A71.1,A71.9",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Bacterial eye infection caused by Chlamydia trachomatis",
        "case_definition": "Follicular conjunctivitis with trichiasis or corneal scarring",
        "laboratory_criteria": "Clinical diagnosis",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Onchocerciasis (River Blindness)",
        "icd10_codes": "B73",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Parasitic disease transmitted by blackflies",
        "case_definition": "Subcutaneous nodules, severe itching, and/or eye lesions",
        "laboratory_criteria": "Identification of microfilariae in skin snip",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Lymphatic Filariasis",
        "icd10_codes": "B74,B74.0,B74.1,B74.2,B74.3,B74.4,B74.8,B74.9",
        "category": "WEEKLY",
        "reporting_hours": 168,
        "description": "Parasitic disease transmitted by mosquitoes causing elephantiasis",
        "case_definition": "Lymphedema, elephantiasis, or hydrocele in endemic area",
        "laboratory_criteria": "Detection of microfilariae or antigen",
        "is_ihr_notifiable": False,
    },
    # MONTHLY REPORTABLE
    {
        "name": "Maternal Deaths",
        "icd10_codes": "O95,O96,O97",
        "category": "MONTHLY",
        "reporting_hours": 720,
        "description": "Death of a woman during pregnancy or within 42 days of termination",
        "case_definition": "Death of a woman while pregnant or within 42 days of termination of pregnancy",
        "laboratory_criteria": "N/A",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Perinatal Deaths",
        "icd10_codes": "P95,P96.0,P96.9",
        "category": "MONTHLY",
        "reporting_hours": 720,
        "description": "Death from 22 weeks gestation to 7 days after birth",
        "case_definition": "Death of fetus/newborn from 22 weeks gestation to 7 days after birth",
        "laboratory_criteria": "N/A",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Severe Acute Malnutrition",
        "icd10_codes": "E40,E41,E42,E43",
        "category": "MONTHLY",
        "reporting_hours": 720,
        "description": "Severe wasting or nutritional edema in children",
        "case_definition": "MUAC < 11.5cm, or weight-for-height < -3 Z-score, or bilateral pitting edema",
        "laboratory_criteria": "Anthropometric measurement",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Animal Bites",
        "icd10_codes": "W54,W55,T14.1",
        "category": "MONTHLY",
        "reporting_hours": 720,
        "description": "Bites from dogs, cats, monkeys, or other animals (potential rabies exposure)",
        "case_definition": "Animal bite requiring post-exposure prophylaxis consideration",
        "laboratory_criteria": "N/A",
        "is_ihr_notifiable": False,
    },
    {
        "name": "Snake Bites",
        "icd10_codes": "T63.0,T63.00,T63.01",
        "category": "MONTHLY",
        "reporting_hours": 720,
        "description": "Venomous or non-venomous snake bites",
        "case_definition": "Snake bite with or without envenomation",
        "laboratory_criteria": "N/A",
        "is_ihr_notifiable": False,
    },
]


class Command(BaseCommand):
    """Management command to seed MOH 502 notifiable diseases."""

    help = "Seed the database with Kenya MOH 502 notifiable diseases list"

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing diseases before seeding",
        )
        parser.add_argument(
            "--update",
            action="store_true",
            help="Update existing diseases instead of skipping",
        )

    def handle(self, *args, **options):
        from hmis.apps.surveillance.models import NotifiableDisease

        clear = options.get("clear", False)
        update = options.get("update", False)

        if clear:
            count = NotifiableDisease.objects.count()
            NotifiableDisease.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {count} existing diseases"))

        created_count = 0
        updated_count = 0
        skipped_count = 0

        for disease_data in MOH_502_DISEASES:
            name = disease_data["name"]

            existing = NotifiableDisease.objects.filter(name=name).first()

            if existing:
                if update:
                    for key, value in disease_data.items():
                        setattr(existing, key, value)
                    existing.save()
                    updated_count += 1
                    self.stdout.write(f"  Updated: {name}")
                else:
                    skipped_count += 1
                    self.stdout.write(f"  Skipped (exists): {name}")
            else:
                NotifiableDisease.objects.create(**disease_data)
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f"  Created: {name}"))

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeding complete: {created_count} created, "
                f"{updated_count} updated, {skipped_count} skipped"
            )
        )

        # Summary by category
        immediate = NotifiableDisease.objects.filter(category="IMMEDIATE").count()
        weekly = NotifiableDisease.objects.filter(category="WEEKLY").count()
        monthly = NotifiableDisease.objects.filter(category="MONTHLY").count()

        self.stdout.write("")
        self.stdout.write(f"Disease counts by category:")
        self.stdout.write(f"  IMMEDIATE: {immediate}")
        self.stdout.write(f"  WEEKLY: {weekly}")
        self.stdout.write(f"  MONTHLY: {monthly}")
        self.stdout.write(f"  TOTAL: {immediate + weekly + monthly}")
