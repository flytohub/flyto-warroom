# Container Base Image License Metadata

This project publishes a private frontend container image (`license: UNLICENSED`).
The application package remains proprietary; base image licenses are tracked so
image consumers can review redistribution obligations separately from app code.

| Dockerfile | Base image | Purpose | License posture |
| --- | --- | --- | --- |
| `Dockerfile` build stage | `node:22-alpine` | Node.js build toolchain on Alpine Linux | Node.js is MIT; Alpine packages are mixed open-source packages with package-level metadata in the image. |
| `Dockerfile` runtime stage | `nginx:alpine` | Static asset serving | NGINX is BSD-2-Clause; Alpine packages are mixed open-source packages with package-level metadata in the image. |

OCI image labels in `Dockerfile` declare the final image license as
`UNLICENSED`; they do not claim that every OS package inside the image has the
same license.
