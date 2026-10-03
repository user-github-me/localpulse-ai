# Project working instructions

- Use a feature branch and open a pull request for every change. Never push changes directly to
  `main` or merge a pull request without the user's instruction.
- The current feature release is v1.1.0. Keep related extension features and documentation in
  that release; a source build is not a published browser-store release.
- Email tracking must never transmit email subjects, bodies, recipient addresses or other email
  content. Keep private keys and decrypted results in the extension. Queue only encrypted read
  events and delete them after local saving and signed acknowledgement. Do not add time expiry.
- Keep the tracking service code, hosting behavior and privacy disclosures public.
