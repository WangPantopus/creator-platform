# Packet heading correction

Product Design S-F7 (docs/source/Product_Design_Flows_Screens_and_Copy.md:247)
requires “Included in your request” and explicitly forbids “What Maya will see”.
The supplied 4A Packet artboard and 5.2 StepIn packet state conflict with that
behavioral wording. The shared `includedInRequest` copy now controls the web
heading. The independent served reference applies the same explicit correction.
The original checked-in artboards are preserved without edits.

Each original-heading/corrected-heading pair uses the exact exported artboard
dimensions, local fonts and theme. All other previously documented corrections
remain applied in both images. StepIn captures packet state 1. These are source
reference evidence; fresh implementation comparisons of both affected screens
in both themes passed. The source-versus-implementation catalog bound is 64 pixels
at ≤2/255 channel difference to cover documented native-control corner rounding.
