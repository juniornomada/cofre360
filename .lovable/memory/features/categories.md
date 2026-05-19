---
name: Hierarchical categories
description: Categories use "Group > Subcategory" format stored in src/lib/categories.ts with CategoryPicker component
type: feature
---
Categories are hierarchical: "Alimentação > Supermercado", "Transporte > Uber/99", etc.
Stored as "Group > Sub" string. Legacy flat values mapped via parseCategoryValue().
CategoryPicker component provides two-level visual selector.
categorize-transaction.ts outputs the new format.
getCategoryDisplay() returns short label for UI display.
