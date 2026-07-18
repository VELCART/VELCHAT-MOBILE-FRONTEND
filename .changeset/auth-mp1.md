---
'@velchat/mobile': minor
---

MP1 auth (start): EnterPhone + Reverse-OTP verify screens (themed), the AuthMachine
(`signed_out|onboarding|verifying|provisioning|active|locked|recovering`) as a Zustand store,
the auth API layer over the axios client, and an Ed25519 device identity key (@noble, SPKI/DER
public key at register; challenge signing) with a CSPRNG polyfill. Welcome now routes to the phone
flow.
