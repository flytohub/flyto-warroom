# Wrap Up Workflow

1. Identify whether the change belongs to generated release assets, frontend
   source, public contracts, or CE backend source.
2. Make durable source changes upstream when possible.
3. Regenerate Flyto2 Warroom CE from the private exporter.
4. Run `make verify`.
5. Review the generated diff for CE usefulness and moat leakage.
