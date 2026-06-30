# Conformance

`validate.py` is intentionally zero-dependency. It verifies the required top-level
fields for the public JSON examples and integration payloads. Full JSON Schema
validation can be layered on by downstream SDKs.

```sh
python conformance/validate.py runner-callback examples/runner-callback.json
python conformance/validate.py evidence-event examples/evidence-event.json
```
