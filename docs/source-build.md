# Public Source Build

The public source profile proves that the PolyForm Noncommercial 1.0.0 CE
engine kernel, worker primitives, and React frontend can be rebuilt directly
from this repository for permitted noncommercial purposes.
It does not pull Flyto2 service images and it does not require credentials.

```sh
make source-build
make source-up
make source-smoke
```

Open `http://127.0.0.1:18088/community`. The page uses the same Community
product-loop component and API client that the full CE image distribution
shows on `/projects`.

The source profile exposes a deterministic, provider-free product loop across
code, container, cloud, runtime, external, evidence, remediation, and
verification contracts. It also runs the CE worker queue, scheduler, backoff,
circuit, and canary self-tests.

This profile intentionally does not claim to be the production-compatible CE
image stack. Database-backed findings, authenticated project management,
provider scans, runner execution, and report delivery use the official CE
images. Commercial intelligence, signed rating authority, managed execution,
live remediation, Enterprise identity, and licensing remain private overlays.

Stop and remove source-profile containers with:

```sh
make source-down
```
