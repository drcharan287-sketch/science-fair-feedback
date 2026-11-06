# 6 November authoritative workbook: 379 versus 424

This document records the **internal count mismatch** in the original file `SCIENCE FAIR 2026-27 EVS & SCIENCE fair details teachers hand0ut.xlsx`. It contains no student names or feedback.

- The worksheet **Total number of projects** reports **379** in **E58**, using `=SUM(E6:E57)`. This adds teacher-entered section totals from column E. Grade 9 **Keats** has a blank total in the summary.
- The workbook contains **44 named class/section detail tabs**, each listing individual student project names. The detail tabs contain **424** project-name entries; seven of these are explicitly titled records with blank serial cells. Header and empty rows are excluded.
- **38 of 44 sections** have a mismatch between their summary project total and the number of names in the respective detail tab. This demonstrates that there is **no reliable way to choose 45 titles for deletion** from the aggregate 379 figure.
- VoiceVote's active roster retains the **424 explicit named projects** (397 reused stable IDs and 27 new IDs) under the organizer's instruction that every named project in the handout is authoritative. This count is verified in Google Sheets, Apps Script and the published Pages snapshot.
- This is an **administrative reconciliation item**, not a translation, vote-scoring or code defect. A revised school source that lists specific excluded projects is required before deleting any.

| Grade | Summary count | Named detail titles | Detail − summary |
|---|---:|---:|---:|
| 3 | 44 | 62 | +18 |
| 4 | 34 | 55 | +21 |
| 5 | 37 | 51 | +14 |
| 6 | 61 | 55 | -6 |
| 7 | 59 | 60 | +1 |
| 8 | 87 | 70 | -17 |
| 9 | 57 | 71 | +14 |
| **Total** | **379** | **424** | **+45** |

**Illustrative section mismatches:**

| Grade / section | Teacher summary | Named entries |
|---|---:|---:|
| 3 · Buntings | 5 | 16 |
| 3 · Cuckoos | 7 | 15 |
| 4 · Neptune | 4 | 13 |
| 8 · IIT-A Hawking | 16 | 8 |
| 9 · Keats | *(blank)* | 11 |

**Decision for school coordinator:** Either correct the counts in the summary to reflect the actual names, or provide a corrected, explicit roster of the titles that should be excluded. Do not instruct developers to delete arbitrary projects just to force the total to 379. The Excel reconciliation report produced in ChatGPT lists all 44 sections and their count differences.

**Technical release evidence:** [PR #64](https://github.com/drcharan287-sketch/science-fair-feedback/pull/64), [PR #66](https://github.com/drcharan287-sketch/science-fair-feedback/pull/66), and [PR #65 live no-save PASS](https://github.com/drcharan287-sketch/science-fair-feedback/actions/runs/42242938311).
