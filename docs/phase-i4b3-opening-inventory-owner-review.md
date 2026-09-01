# Production Opening Inventory — Owner Review Required

Generated from the 16 enabled SKUs belonging to active, purchasable products. Repository values come from the immutable baseline seed; local values are read from the protected Phase I.4A acceptance runtime file. Neither column is production approval.

| Product | SKU ID | Format | Size | Repository bootstrap stock | Local acceptance stock | Difference | Proposed production opening stock |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 喬托・初醒 | `giotto-awakening-01` | beans | 227g | 9 | 9 | 0 | **OWNER REQUIRED** |
| 喬托・初醒 | `giotto-awakening-02` | drip | 10入／每包12g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 達文西盛宴 | `davinci-feast-01` | beans | 227g | 9 | 9 | 0 | **OWNER REQUIRED** |
| 達文西盛宴 | `davinci-feast-02` | drip | 10入／每包12g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 莫內花語 | `monet-floral-01` | beans | 227g | 8 | 8 | 0 | **OWNER REQUIRED** |
| 莫內花語 | `monet-floral-02` | drip | 10入／每包12g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 特納夕日 | `turner-sunset-01` | beans | 227g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 特納夕日 | `turner-sunset-02` | drip | 10入／每包12g | 10 | 9 | -1 | **OWNER REQUIRED** |
| 范戴克・騎士 | `vandyck-knight-01` | beans | 227g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 范戴克・騎士 | `vandyck-knight-02` | drip | 10入／每包12g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 竇加・旋律 | `degas-melody-01` | beans | 227g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 竇加・旋律 | `degas-melody-02` | drip | 10入／每包12g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 拉斐爾之吻 | `raphael-kiss-01` | beans | 227g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 拉斐爾之吻 | `raphael-kiss-02` | drip | 10入／每包12g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 梵谷風靡 | `vangogh-enchantment-01` | beans | 227g | 10 | 10 | 0 | **OWNER REQUIRED** |
| 梵谷風靡 | `vangogh-enchantment-02` | drip | 10入／每包12g | 10 | 10 | 0 | **OWNER REQUIRED** |

Owner approval must supply one explicit non-negative integer for every SKU. Apply the approved values to a reviewed copy of `bootstrap/store/website-data.json`, recalculate its hash, and update the migration manifest before any production volume bootstrap. Do not derive approval from either stock column.
