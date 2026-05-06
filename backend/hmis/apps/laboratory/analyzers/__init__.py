"""
Phase L3: Analyzer Interfacing Module.

Provides bidirectional communication with laboratory analyzers via:
- ASTM E1394/LIS2-A2 protocol
- HL7 v2.x over MLLP (enhanced bidirectional)
- Serial/RS-232 via TCP-Serial bridge

Key models:
- InstrumentChannel: Communication channel config per instrument
- AnalyzerMessage: Individual messages sent/received from analyzers

Key features:
- Work order download (host query): analyzer requests pending orders
- Result upload: auto-parse results from analyzer output
- Sample ID mapping (barcode → lab order item)
- Real-time connection status monitoring
- Pre-built driver templates for common Kenya lab analyzers
"""
