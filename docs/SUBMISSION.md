# Submission notes

## Use of Meta products

Fitts runs on Meta's models end to end. **Muse Spark 1.3** is the everyday brain: it holds the
interview, reads the code into an App Model, decides each crawl step, walks journeys from
screenshots and answers in the chat. In the Economy profile it also runs the five reviewers,
merges their findings, does the theme check and draws up the redesign's directions. **Muse
Wonder 1.0** does the hard judgment: in every profile it judges surprising page changes and
reviews the fixes a measurement can't check, and in the Quality profile it is two of the five
reviewers, merges their findings, does the theme check and draws up the redesign's directions. **Muse Code**, Meta's coding agent running Muse Wonder, makes the fixes inside an edit
allowlist and does the second pass of understanding a project. When Muse Code isn't available,
Fitts's own fixer runs on Muse Wonder in Quality and Muse Spark otherwise. **Muse Spark Open** on
Baseten is a full stage, not a token: it's an independent reviewer in the Quality profile, and
in the Open profile it runs every reviewer, the merging and the theme check. **Muse Image 1.0**
draws mockups and redesign illustrations, **SAM 3.1** outlines the element each finding is
about, and **Muse Voice Transcribe 1.0** turns the owner's voice messages and voice
commands into text.
