# pj_skills

It all started with this prompt:

*Waclaw, knowing what we do, what are the skills you could distill both for me to finetune for later so we are more structured and for others to have a look and adopt/adapt?*

This resulted in this repo content, four skills (one multi file). Details below:

+ [voice etiquette](voice-etiquette/SKILL.md) - base conversational rules for speech-operated sessions; load it alongside any skill used by voice.
+ [mhm skill](mhm/SKILL.md) - hands-free thought capture for voice sessions: the agent listens with minimal acknowledgements, grills/refines only when asked, and saves a raw plus a refined note.
+ [requirements grill](req-grill/SKILL.md) - voice-first requirements elicitation, one question at a time with a strawman answer, ending in a referenceable spec and an implementation prompt an autonomous coding agent can build from.
+ [speech to deck](speech-to-deck/SKILL.md) - turns a recording (speech, talk, voice memo) into a self-contained HTML deck with navigation, animations and a listen-along mode synced to the audio, in one of three styles (consulting, whiteboard, minimal). Transcribes locally with whisper.cpp; every deck goes through automated QA and an independent design and motion critique.

Long story short - it is all about voice and structured document creation. One building on another. Read before you reuse. Enjoy.

## License

[MIT](LICENSE).

Third-party: the fonts in `speech-to-deck/assets/fonts/` (Inter, Kalam, Source Serif 4, IBM Plex Sans) are under the [SIL Open Font License 1.1](speech-to-deck/assets/fonts/OFL.txt) (the IBM Plex Sans files are IBM's own unmodified web subsets from `@ibm/plex-sans-variable` 0.2.0); `speech-to-deck/assets/vendor/rough.min.js` is rough.js by Preet Shihn, [MIT](speech-to-deck/assets/vendor/rough.LICENSE.txt).