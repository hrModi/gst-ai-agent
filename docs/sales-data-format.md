# Sales Data Upload Format

This document describes the expected Excel/CSV format for uploading sales data (invoices) into the GST Filing Management System.

---

## Quick Start

1. Download the sample template from the **Upload Sales Data** page ("Download Sample" link).
2. Open the file in Excel — Sheet 1 contains one example row per transaction type; Sheet 2 explains every column.
3. Replace the sample rows with your actual invoice data, keeping the header row intact.
4. Upload the file via the Upload Sales Data page.

---

## Column Reference

| Column | Required? | Format / Allowed Values | Notes |
|---|---|---|---|
| **Invoice Number** | Required | Text | Must be unique within the same client + month + year |
| **Invoice Date** | Required | DD-MM-YYYY | Real date within the filing month; no future dates |
| **Buyer GSTIN** | Required for B2B | 15-char GSTIN | e.g. `27AABCU9603R1ZX` — leave blank for B2C and exports |
| **Buyer Name** | Optional | Text | Recommended for B2C transactions (unregistered buyers) |
| **Place of Supply** | Optional | 2-digit state code | e.g. `27` = Maharashtra, `07` = Delhi, `06` = Haryana |
| **Reverse Charge** | Optional | `Y` or blank | `Y` = reverse charge applies to this transaction |
| **Invoice Value** | Optional | Number (INR) | Total value including tax (informational) |
| **Taxable Value** | Required | Number (INR) | Value before tax — must be positive (or negative for credit notes) |
| **Tax Rate** | Required for tax check | Number (percentage) | e.g. `18` for 18% GST, `5` for 5%, `0` for zero-rated |
| **IGST Amount** | Conditional | Number (INR) | Fill for inter-state transactions; leave `0` for intra-state |
| **CGST Amount** | Conditional | Number (INR) | Fill for intra-state; must equal SGST; leave `0` for inter-state |
| **SGST Amount** | Conditional | Number (INR) | Fill for intra-state; must equal CGST; leave `0` for inter-state |
| **Cess Amount** | Optional | Number (INR) | Leave `0` if cess is not applicable |
| **HSN Code** | Optional* | 4, 6, or 8 digit number | *Recommended; must be numeric if provided |
| **Description** | Optional | Text | Item or service description |
| **Note Type** | For credit/debit notes | `CREDIT` or `DEBIT` | Classifies the row as a CDNR — also fill Original Invoice |
| **Original Invoice** | For CDNR only | Text | Invoice number being reversed by this credit/debit note |
| **Export Type** | For exports only | `WPAY` or `WOPAY` | `WPAY` = export with payment of tax; `WOPAY` = without payment |

---

## Transaction Type Classification

The system automatically classifies each row into a GSTR-1 transaction type based on the column values. You do **not** need to specify the type manually.

| Type | Condition |
|---|---|
| **CDNR** | `Note Type` is `CREDIT` or `DEBIT` |
| **EXP** | `Export Type` is `WPAY` or `WOPAY` |
| **B2B** | `Buyer GSTIN` is present and passes GSTIN format validation |
| **B2CL** | No GSTIN and `Taxable Value` > 2,50,000 |
| **B2CS** | No GSTIN and `Taxable Value` ≤ 2,50,000 |

The classification runs in the order shown above — CDNR takes priority, then EXP, then GSTIN-based checks.

---

## Validation Rules

All rows are checked against the following rules after upload. Rows that fail any `ERROR`-severity check are marked **INVALID** and must be corrected before JSON generation.

### 1. GSTIN Format
- Pattern: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
- **Error** if `Buyer GSTIN` is present but does not match the pattern.
- GSTIN must be uppercase — `27aabcu9603r1zx` will fail.

### 2. Invoice Number Uniqueness
- **Error** if the same invoice number appears more than once for the same client, month, and year.
- Applies to credit/debit notes (CN-001, DN-001) as well.

### 3. Tax Calculation
- For each row, the system checks: `(Taxable Value × Tax Rate / 100)` ≈ `IGST` or `(CGST + SGST)`
- Tolerance: ±0.01 INR for rounding differences.
- **Error** if the calculated tax differs from the entered amounts beyond the tolerance.

### 4. Required Fields
- **Error** if `Invoice Number` is blank.
- **Error** if `Invoice Date` is blank.
- **Error** if `Taxable Value` is zero or missing.

### 5. Date Format
- Expected format: `DD-MM-YYYY` (e.g. `15-01-2026`).
- **Error** if the date is not parseable or uses a different separator (e.g. `/` instead of `-`).

### 6. HSN/SAC Code
- Must be a 4, 6, or 8 digit number if provided.
- **Warning** (not an error) if HSN is missing — the row can still be filed.

### 7. Transaction Type
- **Warning** if a row cannot be classified into any of the five types (e.g. no GSTIN and no export type but taxable value is 0).

---

## Example Rows

### B2B — Intra-State (CGST + SGST)

| Field | Value |
|---|---|
| Invoice Number | INV-001 |
| Invoice Date | 15-01-2026 |
| Buyer GSTIN | 27AABCU9603R1ZX |
| Place of Supply | 27 |
| Taxable Value | 20,000 |
| Tax Rate | 18 |
| CGST Amount | 1,800 |
| SGST Amount | 1,800 |
| IGST Amount | 0 |
| HSN Code | 9983 |

Supplier and buyer are both in Maharashtra (state code 27), so CGST + SGST applies.

---

### B2B — Inter-State (IGST)

| Field | Value |
|---|---|
| Invoice Number | INV-002 |
| Invoice Date | 16-01-2026 |
| Buyer GSTIN | 06AABCU9603R1ZX |
| Place of Supply | 06 |
| Taxable Value | 50,000 |
| Tax Rate | 18 |
| IGST Amount | 9,000 |
| CGST Amount | 0 |
| SGST Amount | 0 |

Buyer is in Haryana (state code 06) while supplier is in Maharashtra — IGST applies.

---

### B2CS — Small Unregistered Buyer

| Field | Value |
|---|---|
| Invoice Number | INV-003 |
| Invoice Date | 17-01-2026 |
| Buyer GSTIN | *(blank)* |
| Buyer Name | Walk-in Customer |
| Place of Supply | 27 |
| Taxable Value | 5,000 |
| Tax Rate | 18 |
| CGST Amount | 450 |
| SGST Amount | 450 |

No GSTIN provided and taxable value ≤ 2,50,000 → classified as B2CS.

---

### B2CL — Large Unregistered Buyer

| Field | Value |
|---|---|
| Invoice Number | INV-004 |
| Invoice Date | 18-01-2026 |
| Buyer GSTIN | *(blank)* |
| Buyer Name | ABC Traders |
| Place of Supply | 07 |
| Taxable Value | 3,00,000 |
| Tax Rate | 18 |
| CGST Amount | 27,000 |
| SGST Amount | 27,000 |

No GSTIN and taxable value > 2,50,000 → classified as B2CL.

---

### CDNR — Credit Note

| Field | Value |
|---|---|
| Invoice Number | CN-001 |
| Invoice Date | 20-01-2026 |
| Buyer GSTIN | 27AABCU9603R1ZX |
| Taxable Value | -2,000 |
| Tax Rate | 18 |
| CGST Amount | -180 |
| SGST Amount | -180 |
| Note Type | CREDIT |
| Original Invoice | INV-001 |

Negative taxable and tax values. `Note Type` = `CREDIT` triggers CDNR classification.

---

### EXP — Export Without Payment of Tax

| Field | Value |
|---|---|
| Invoice Number | EXP-001 |
| Invoice Date | 22-01-2026 |
| Buyer GSTIN | *(blank)* |
| Buyer Name | Global Corp USA |
| Taxable Value | 75,000 |
| Tax Rate | 0 |
| IGST Amount | 0 |
| Export Type | WOPAY |
| HSN Code | 8471 |

No GSTIN (foreign buyer), zero-rated, `Export Type` = `WOPAY` → classified as EXP.

---

## Common Mistakes

| Mistake | Effect | Fix |
|---|---|---|
| GSTIN in lowercase | Validation error (GSTIN format) | Convert to uppercase before uploading |
| Date as `15/01/2026` instead of `15-01-2026` | Validation error (date format) | Use `-` as separator; format cells as Text in Excel |
| Excel auto-converting date to serial number | Invalid date | Format the Invoice Date column as **Text** before entering dates |
| CGST ≠ SGST for intra-state | Tax calculation error | Both must be equal (each = taxable × rate / 200) |
| IGST filled alongside CGST/SGST | Tax calculation error | Use IGST for inter-state OR CGST+SGST for intra-state — not both |
| Taxable Value = 0 | Required field error | Each row must have a non-zero taxable value |
| Duplicate invoice numbers in the same file | Uniqueness error | Each invoice number must appear only once per upload |
| HSN code as text like `9983A` | HSN format warning | HSN must be purely numeric (4–8 digits) |
| Credit note amount as positive | Tax mismatch or incorrect filing | Enter negative values for taxable value and tax amounts on credit notes |

---

## State Codes Reference (Common)

| Code | State |
|---|---|
| 01 | Jammu & Kashmir |
| 06 | Haryana |
| 07 | Delhi |
| 09 | Uttar Pradesh |
| 19 | West Bengal |
| 27 | Maharashtra |
| 29 | Karnataka |
| 32 | Kerala |
| 33 | Tamil Nadu |
| 36 | Telangana |

For the complete list, refer to the [GST state code master](https://www.gst.gov.in/).
