// Country name (as used in data/places.json) → ISO 3166-1 alpha-2, rendered as a flag emoji.
const ISO = {
  USA: 'US', Canada: 'CA', Mexico: 'MX', Cuba: 'CU', Panama: 'PA', Colombia: 'CO', Peru: 'PE', Ecuador: 'EC',
  Chile: 'CL', Argentina: 'AR', Brazil: 'BR', Venezuela: 'VE', Bolivia: 'BO', Iceland: 'IS', Greenland: 'GL',
  UK: 'GB', Ireland: 'IE', France: 'FR', Spain: 'ES', Portugal: 'PT', Italy: 'IT', Germany: 'DE',
  Netherlands: 'NL', Belgium: 'BE', Switzerland: 'CH', Austria: 'AT', Czechia: 'CZ', Poland: 'PL', Hungary: 'HU',
  Denmark: 'DK', Sweden: 'SE', Norway: 'NO', Finland: 'FI', Estonia: 'EE', Greece: 'GR', Turkey: 'TR',
  Ukraine: 'UA', Russia: 'RU', Egypt: 'EG', Morocco: 'MA', Tunisia: 'TN', Nigeria: 'NG', Ghana: 'GH',
  Senegal: 'SN', Ethiopia: 'ET', Kenya: 'KE', Tanzania: 'TZ', 'DR Congo': 'CD', Angola: 'AO', Zimbabwe: 'ZW',
  'South Africa': 'ZA', Madagascar: 'MG', Mauritius: 'MU', Israel: 'IL', Lebanon: 'LB', 'Saudi Arabia': 'SA',
  UAE: 'AE', Qatar: 'QA', Iran: 'IR', Iraq: 'IQ', Afghanistan: 'AF', Pakistan: 'PK', India: 'IN', Nepal: 'NP',
  Bangladesh: 'BD', 'Sri Lanka': 'LK', Maldives: 'MV', Myanmar: 'MM', Thailand: 'TH', Vietnam: 'VN',
  Cambodia: 'KH', Malaysia: 'MY', Singapore: 'SG', Indonesia: 'ID', Philippines: 'PH', China: 'CN', Taiwan: 'TW',
  'South Korea': 'KR', 'North Korea': 'KP', Japan: 'JP', Mongolia: 'MN', Kazakhstan: 'KZ', Uzbekistan: 'UZ',
  Australia: 'AU', 'New Zealand': 'NZ', 'Papua New Guinea': 'PG', Fiji: 'FJ', 'French Polynesia': 'PF',
  Antarctica: 'AQ', Jordan: 'JO', Mali: 'ML', Algeria: 'DZ', Georgia: 'GE', Azerbaijan: 'AZ', Armenia: 'AM',
  'Cape Verde': 'CV', Yemen: 'YE', Mauritania: 'MR', Kyrgyzstan: 'KG', Bhutan: 'BT',
  Serbia: 'RS', Romania: 'RO', Bulgaria: 'BG', Croatia: 'HR', Latvia: 'LV', Lithuania: 'LT', Belarus: 'BY',
  Sudan: 'SD', Uganda: 'UG', Zambia: 'ZM', Mozambique: 'MZ', 'Ivory Coast': 'CI', Uruguay: 'UY', Oman: 'OM',
  Kuwait: 'KW', Syria: 'SY', Jamaica: 'JM', 'Dominican Republic': 'DO', 'Puerto Rico': 'PR', Slovenia: 'SI',
  'Bosnia and Herzegovina': 'BA', 'North Macedonia': 'MK', Albania: 'AL', Moldova: 'MD', Tajikistan: 'TJ',
  Turkmenistan: 'TM', Laos: 'LA', 'New Caledonia': 'NC', 'Costa Rica': 'CR', Nicaragua: 'NI', Haiti: 'HT',
  Paraguay: 'PY', Namibia: 'NA', 'Burkina Faso': 'BF', Rwanda: 'RW', Botswana: 'BW', Djibouti: 'DJ',
  Somalia: 'SO', Cyprus: 'CY', Malta: 'MT', 'Faroe Islands': 'FO', 'Timor-Leste': 'TL', 'Solomon Islands': 'SB',
  Vanuatu: 'VU', Tonga: 'TO', Samoa: 'WS', 'Marshall Islands': 'MH', Palau: 'PW', 'Northern Mariana Islands': 'MP',
  'Cook Islands': 'CK', Guyana: 'GY', Suriname: 'SR', 'French Guiana': 'GF', Niger: 'NE', Chad: 'TD',
  'Sierra Leone': 'SL', Liberia: 'LR', Gabon: 'GA', 'Republic of the Congo': 'CG', Malawi: 'MW', Eritrea: 'ER',
};

// Inline <img> of a bundled SVG flag (Windows has no flag emoji glyphs, so emoji would show as letters).
export function flag(country) {
  const code = ISO[country];
  if (!code) return '';
  return `<img class="flag" src="/flags/${code.toLowerCase()}.svg" alt="${code}">`;
}
