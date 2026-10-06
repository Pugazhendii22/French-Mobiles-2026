# Products slice — click-through checklist

The automated checks on branch `restructure/skeleton-and-products` all pass:
44 tests, a clean build, and every created or moved file eslint-clean. None of
them can tell you a product still saves.

This machine has no `.env`, so the app cannot reach Firebase here — it shows
"Configuration missing" and React never mounts. **This list has to be run by
someone with the shop's credentials.** Until it is, the slice is verified
structurally but not behaviourally.

```bash
npm run dev
```

## Products list — `/products`

- [ ] The list loads, newest product first
- [ ] The count badge beside the "Products" heading matches what is listed
- [ ] Search by product name filters
- [ ] Search by brand filters
- [ ] Search by a compatible model filters (e.g. a model only one product lists)
- [ ] Search ignores spaces — "powerbank" finds "Power Bank"
- [ ] The category dropdown filters
- [ ] The status dropdown filters (in stock / low stock / out of stock)
- [ ] A category and a search term together narrow correctly
- [ ] The coloured left border matches status: red out of stock, orange low, green in
- [ ] "Sell" on a card lands on `/sales` with that product already in the sale

## Adding a product

- [ ] The "+" button (mobile) and "Add Product" (desktop) both open the form
- [ ] Saving with the name blank scrolls to the name field and focuses it
- [ ] Same for a blank sale price, and a blank stock quantity
- [ ] Typing in a field with an error clears that error straight away
- [ ] Leaving SKU blank generates one
- [ ] Entering a SKU keeps the one you typed
- [ ] Compatible models typed as "Nokia 105, Nokia 110" save as two separate models
- [ ] Stock 0 saves with status "out of stock"
- [ ] Stock at or below the low-stock threshold saves as "low stock"
- [ ] Stock above it saves as "in stock"
- [ ] Uploading a photo works and the thumbnail appears
- [ ] After saving, the button reads "Saved" and the list includes the product

## Editing a product

- [ ] "Edit" on the detail page pre-fills every field, including compatible models
- [ ] Changing the price saves, and the detail page shows the new price
- [ ] Changing stock updates the status badge accordingly
- [ ] Reopening the list shows the edited values — not a stale cached row

## The two things the review turned up

- [ ] Open a product whose stock is **0** (sold out), change only its price, save.
      It must save. This was broken before — validation treated 0 as a missing
      value and refused, so sold-out items could not be repriced.
- [ ] A product with sale price 0 can also be saved
- [ ] To see the new error banner: turn off the network and reload `/products`.
      It must say it could not load the list, **not** "No products found".

## Labels and printing

- [ ] "Assign Label" on the detail page offers the next number and saves it
- [ ] After assigning, the button becomes "Print #N"
- [ ] "Print #N" opens the printer dialog with the right product, brand and price
- [ ] "Save & Print Label" on the form saves, assigns a label, and opens the printer
- [ ] Its status line reads "Saved & Label #N Assigned ✓" and the button disables
- [ ] Reopening that product's form recognises it already has a label
- [ ] **Watch for this specifically:** after a save-and-print, go back to the
      products list. The product must not appear unlabelled. This is the one
      behaviour the slice deliberately changed — the write now refreshes the
      cached list, where before it did not.

## Scanning

- [ ] Scanning a product label from `/scanner` opens the right product
- [ ] The scan result shows current details

## Known, and not regressions

- **A product cannot be deleted from the UI.** The confirmation dialog exists
  but nothing opens it. That was already true before this work.
- **Editing a product does not refresh its label snapshot.** A reprinted label
  can show the old price. Also already true — second-hand and service orders do
  refresh theirs; products never did.

If anything above fails, say which line. Do not start the next slice on top of
a products slice that does not work: `git revert` the offending commit instead.
