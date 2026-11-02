# Doctor Vital Sign Guidance and Consultation Field Limits

## Implementation

- Kept backend validation authoritative and preserved draft and completion workflows.
- Added units, examples, and explicit technical limits beside all five vital-sign inputs: blood pressure uses two or three positive digits per value; heart rate 1–300 integer lpm; temperature 25–45 °C with one decimal; weight 0.1–500 kg with one decimal; height 0.1–3 m with two decimals. Numeric measurements enforce those bounds and precision on the server.
- Added non-blocking reference warnings for adult resting blood pressure, pulse, and temperature. The adult reference notice appears only when the patient's persisted birth date establishes that the patient is an adult. No adult reference is applied to minors. Weight and height show units and entry examples without a generalized clinical range.
- Reference values are informational for average healthy adults at rest. They vary by patient context and are not diagnostic thresholds. Sources: [MedlinePlus Vital Signs](https://medlineplus.gov/ency/article/002341.htm) and [American Heart Association blood pressure readings](https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings).
- Set matching browser and server text limits: consultation reason 500; patient condition 500; medical evaluation 1,500; diagnosis 200; diagnosis notes 200; medication name 150; dosage, frequency, and duration 100 each; medication instructions 1,000; recommendations 500; and medical orders up to 30 non-empty lines of 300 characters each.
- Medical orders display a non-blocking inline validation message while typing and are also validated before browser submission and on the server. The aggregate textarea maximum is 9,029 characters, including 29 possible line separators.
- Updated US-DOC-05 acceptance criteria and the repository checklist. No schema or dependency change was required.

## Verification

- Focused Jest: 3 suites and 49 tests passed.
- Full Jest: 111 suites and 845 tests passed.
- ESLint: passed.
- Prettier check: passed.
- Tailwind CSS build: passed.
- Full Playwright end-to-end suite: passed, including accessibility checks available in the repository.
- `git diff --check`: passed.
