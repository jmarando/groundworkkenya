# Election atlas: what's loaded

Written by scripts/atlas/report.ts from data/atlas. Each figure's document is listed under Sources; whatever a county lists as missing was not found.

## Nairobi

| Election | Constituencies with results | Turnout | County total |
|---|---|---|---|
| 2013 president | 0 of 17 | 0 of 17 | yes |
| 2013 governor | 0 of 17 | 0 of 17 | no |
| 2013 mp | 0 of 17 | 0 of 17 | n/a |
| 2017 president | 0 of 17 | 0 of 17 | no |
| 2017 governor | 0 of 17 | 0 of 17 | no |
| 2017 mp | 0 of 17 | 0 of 17 | n/a |
| 2022 president | 0 of 17 | 0 of 17 | yes |
| 2022 governor | 13 of 17 | 0 of 17 | yes |
| 2022 mp | 0 of 17 | 0 of 17 | n/a |

Registered voters by ward: 2013: 0 of 85 · 2017: 0 of 85 · 2022: 85 of 85.
Population estimates: 85 of 85 wards.
Population estimate below the 2022 register in 29 of 85 wards: Kabiro, Mutu-ini, Ngando, Kayole South, Upper Savannah, Utawala, Dandora Area I, Imara Daima, Kwa Njenga, Pipeline, Eastleigh South, Pumwani, Clay City, Laini Saba, Sarangombe, Mugumo-ini, Nyayo Highrise, South C, Harambee, Maringo/Hamza, Mabatini, Mlango Kubwa, Kahawa, Zimmerman, Nairobi Central, Nairobi South, Ngara, Ziwani/Kariokor, Parklands/Highridge.

Missing:
- 2013 president: results for 17 of 17 constituencies
- 2013 governor: results for 17 of 17 constituencies
- 2013 governor: the county total
- 2013 mp: results for 17 of 17 constituencies
- 2017 president: results for 17 of 17 constituencies
- 2017 president: the county total
- 2017 governor: results for 17 of 17 constituencies
- 2017 governor: the county total
- 2017 mp: results for 17 of 17 constituencies
- 2022 president: results for 17 of 17 constituencies
- 2022 governor: results for 4 of 17 constituencies
- 2022 mp: results for 17 of 17 constituencies

## Nyeri

| Election | Constituencies with results | Turnout | County total |
|---|---|---|---|
| 2013 president | 0 of 6 | 0 of 6 | yes |
| 2013 governor | 0 of 6 | 0 of 6 | no |
| 2013 mp | 0 of 6 | 0 of 6 | n/a |
| 2017 president | 0 of 6 | 0 of 6 | no |
| 2017 governor | 0 of 6 | 0 of 6 | no |
| 2017 mp | 0 of 6 | 0 of 6 | n/a |
| 2022 president | 1 of 6 | 1 of 6 | yes |
| 2022 governor | 0 of 6 | 0 of 6 | no |
| 2022 mp | 0 of 6 | 0 of 6 | n/a |

Registered voters by ward: 2013: 0 of 6 · 2017: 0 of 6 · 2022: 6 of 6.
Population estimates: 6 of 6 wards.
Population estimate below the 2022 register in 1 of 6 wards: Karatina Town.

Missing:
- 2013 president: results for 6 of 6 constituencies
- 2013 governor: results for 6 of 6 constituencies
- 2013 governor: the county total
- 2013 mp: results for 6 of 6 constituencies
- 2017 president: results for 6 of 6 constituencies
- 2017 president: the county total
- 2017 governor: results for 6 of 6 constituencies
- 2017 governor: the county total
- 2017 mp: results for 6 of 6 constituencies
- 2022 president: results for 5 of 6 constituencies
- 2022 governor: results for 6 of 6 constituencies
- 2022 governor: the county total
- 2022 mp: results for 6 of 6 constituencies

## Sources

- `electionskenya-2013-president`: 2013 presidential results by county, electionskenya.org, http://www.electionskenya.org/results/PR/2013/. A third-party election observation site; its 2013 national totals match IEBC's declaration. County rows list only the four leading candidates and no votes cast. Parties and coalitions come from the candidates' widely reported 2013 tickets
- `electionskenya-2022-register`: Registered voters per county assembly ward, 2022, electionskenya.org, http://www.electionskenya.org/county/047/. Ward pages of a third-party site carrying IEBC's 2022 register. Nairobi's wards add up to 2,415,310 against IEBC's declared 2,416,551. Mugumo-ini is spelt Mugumu-ini there.
- `iebc-2022-form-34c`: Declaration of results for the election of President, national tallying centre, by county (Form 34C summary), 2022, IEBC, https://www.iebc.or.ke/uploads/resources/QLTlLJx0Vr.pdf. County and national totals as printed. Votes cast is valid plus rejected. The national valid total (14,213,137) is 110 more than the four candidates' votes added up (14,213,027), as printed.
- `star-2022-mathira-president`: Mathira gives Ruto massive win over Raila, The Star, https://www.the-star.co.ke/news/2022-08-14-mathira-gives-ruto-massive-win-over-raila. Mathira's presidential result as printed. Its 'votes cast' (73,439) equals the four candidates' votes added up, so it is probably the valid total; entered as printed.
- `star-2022-nairobi-governor`: Sakaja declared winner in Nairobi governor race, The Star, https://www.the-star.co.ke/counties/central/2022-08-14-sakaja-declared-winner-in-nairobi-governor-race. Sakaja's and Igathe's votes county-wide and in each constituency, as printed (the top two only). Three rows labelled only 'Embakasi' can't be placed and Embakasi South's Igathe figure is misprinted ('3,7647'), so the four Embakasi North, Central, East and South rows are left out.
- `worldpop-2020-agesex`: Age and sex structures, Kenya, 2020, 100 m grid, WorldPop (University of Southampton), https://hub.worldpop.org/geodata/listing?id=65. Estimates, summed inside each ward's boundary through WorldPop's statistics API (dataset wpgpas); 18–34 counts two fifths of the 15–19 band.
