# Settled decisions

## Settings localization

Do not leave the Web settings labels and Schema descriptions in separately maintained dictionaries when the same settings appear in both. The settled decision is to keep their shared localized copy in a browser-safe module consumed by both surfaces. Schema-based clients receive a description derived from that copy, while the Web page renders the shared label and hint separately.
