# VoiceVote voting integrity and operations

## One vote per browser
Each visitor's browser creates a random UUID stored in localStorage. The form sends it over HTTPS POST. Apps Script stores its SHA-256 hash in Feedback column J and the submission UUID in column I. Under a script lock, a repeated token cannot submit feedback for the same or another project. Columns I/J are hidden from the normal Feedback view, not deleted.

Browser tokens do not identify a physical device or person. Incognito mode, cleared storage, or a new browser can bypass this limitation. Shared browser installations permit only one visitor's vote. Stronger one-person-one-vote enforcement needs unique attendee-issued single-use codes; it does not require individual project QR codes.

## Admin dashboard
The restricted Google Sheet has an Admin Rankings tab with vote counts, average stars, and weighted rankings and a Feedback Viewer tab that displays text only after selecting a project. Keep both private and avoid sharing the Sheet publicly. Hidden tabs or columns are not access controls.

## Release order
Release the frontend token support first. Confirm that the live browser POST includes deviceToken without sending actual feedback. Then release the backend validator. Run the non-writing probe and catalog test. Validate any production write only with explicit authorization and inspect the resulting Feedback sheet.

## Event readiness
Test mobile browsers, low-network conditions, translation, voice dictation, and 300-project catalog navigation. Consider staff-assisted corrections, a moderation policy, and a printed fallback collection plan.
