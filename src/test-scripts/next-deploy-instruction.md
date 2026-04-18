Here are all the prompts you'll encounter and what to select for each:

ready_product_allocation table changes
allocation_type column → create column (new column)
created_new_ready_product_row column → was_auto_created (rename column) — Drizzle will detect the old name is gone and was_auto_created is new
auto_added_quantity column → create column (new)
quantity_before column → create column (new) — may show as renamed from nothing, pick create
probable_before column → create column (new)
sent_quantity_in_main_unit column → create column (new)
ready_product table changes
quantity_in_main_unit default → Apply the change (adding default 0)
probable_remaining_quantity default → Apply the change (adding default 0)
