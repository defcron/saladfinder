# Daywork design system

Primary reference: `daywork-concept.png`, generated before implementation. The full find-work screen is the reference; other transactional screens extend its typography, colour, spacing, and control language.

- Background #f7f6f2, ink and primary actions #173e32, lime notice/accent #d4ec97, dividers #c9ccc5, muted text #616762.
- Georgia bold for display headings, job titles, wordmark and primary actions. Arial/Helvetica for labels, body text and compact status information. Display heading 70px maximum; body 17px; labels 16px; notes 14px.
- Content width 1408px maximum, 40px desktop gutters. A compact 72px divider-based desktop header and a separated footer frame the screen. Primary marketplace uses a 258px category rail with an open separated list, not cards.
- Controls: 48px minimum input/button height, 8px corner radius, 1px borders, visible keyboard focus. Lime is an accent background, never low-contrast body text.
- Reference copy is retained: Good work. A shorter wait for payday. / Find local jobs with clear pay and agreed milestones. Get paid as work is approved. / Made for Ontario / Work, on your terms.
- Intentional functional extension: launch notice links to a working persisted waitlist, examples open clearly labelled non-bookable detail pages, filters and searches operate on both example and real data. Payout footnote links to timing details.
- Below 800px navigation becomes an accessible disclosure; filters form two columns above the results, and secondary panels stack. Below 480px job pay moves beneath the title for readability. No images or invented profile photos are used in the UI; the brand mark is a simple native vector.
- Interactive states include loading, empty, error, success, pending provider setup, Stripe eligibility, and signed-in role/ownership. Provider redirects are limited to HTTPS Stripe domains.

## Fidelity review

The initial desktop and mobile renders were inspected alongside the complete concept using `view_image` at the concept dimensions (1488 × 1058) and the mobile capture width (390px).

| Comparison            | Observation and implemented response                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy                  | Primary headline, supporting sentence, Ontario note, launch notice, result heading, sample titles and amounts match the reference. The first example explicitly says “2 milestones.”                                                                                                                          |
| Layout                | Open list rows and the left filter rail match the reference container model. The rail was adjusted to 258px so the result heading aligns at approximately x330 in the native desktop render. The pay column uses 30% of list width to restore the reference alignment.                                        |
| Typography            | Georgia provides the reference’s strong serif heading and listing hierarchy; Arial/Helvetica supplies practical body and form text. No remote font dependency.                                                                                                                                                |
| Palette               | Ivory background, forest text/actions, pale lime notice/brand accent, and thin muted dividers retained. No decorative imagery, avatars, or unsupported product claims added.                                                                                                                                  |
| Spacing               | Desktop header reduced from 84px to 72px to restore the reference’s first-viewport rhythm and footer visibility.                                                                                                                                                                                              |
| Filter controls       | Initial render exposed a floated fieldset legend that pushed the “Any schedule” label across the divider. Removed the float and made the legend a full-width block with its own divider.                                                                                                                      |
| Mobile                | No horizontal overflow in the inspected 390px render. Navigation collapses to a disclosure, filters become two columns, and pay moves below the listing title. The secondary Ontario note is intentionally omitted to prioritise the main task; Ontario/CAD context remains in the product and launch notice. |
| Functional extensions | The launch notice is a real early-access link, the payout note links to full timing details, and example rows open clearly non-bookable explanatory detail pages. These are deliberate additions to make the static reference useful.                                                                         |

Final desktop/mobile captures and automated test evidence are maintained in the parent verification report. The visual repair above was built and typechecked before the final capture pass.
