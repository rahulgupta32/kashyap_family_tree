"""Read certificate identities after a successful apksigner verify invocation."""
import re


def verified_certificate_digests(output):
    # Android build-tools print either numbered signers or scheme-labelled signers.
    # Repeated schemes for the same certificate do not create a second identity.
    return sorted(set(value.lower() for value in re.findall(
        r'^(?:Signer #\d+|V[123](?:\.1)? Signer:) certificate SHA-256 digest: ([a-fA-F0-9]{64})\s*$',
        output, re.MULTILINE)))
