# Manual Browser Smoke

Manual browser smoke, for release operators:

1. Deploy or serve the built frontend through the normal certified-asset canister path.
2. Open `/`.
3. Confirm open proposal cards render.
4. Confirm proposal-analysis badges appear where expected.
5. Open `/proposal/{real proposal id}`.
6. Confirm the proposal detail and proposal-analysis panel render.
7. Confirm lifecycle mode, severity groups, and evidence sections render where relevant.
8. Open `/subnet/{real subnet principal}`.
9. Confirm subnet detail page renders.
10. Confirm map/globe area renders or degrades gracefully.
11. Confirm node list/details work.
12. Confirm the Globalping link says "Manual external check - Not used by NNX validation."
13. Open `/neuron/{real neuron id}`.
14. Confirm neuron page and vote-guarantee wording render.
15. Check malformed routes:
    - `/subnet/not-a-principal` -> 404
    - `/subnet/{valid}/extra` -> 404
    - `/proposal/not-a-number` -> 404
    - `/neuron/not-a-number` -> 404
16. Check the browser console manually for unexpected errors.

This is a manual release check only. It does not provide validation data to NNX,
and Globalping remains a reviewer aid only.
