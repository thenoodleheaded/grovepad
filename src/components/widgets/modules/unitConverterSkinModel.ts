import type {
  UnitConverterCategory,
  UnitConverterData,
  UnitConverterSkin,
} from '../../../types/widgetDataExpansion'

/**
 * One conversion engine for the renderer and the circuit output port.
 *
 * A skin changes the set of useful units, never the meaning of the Input and
 * Converted output ports. Persisted cards from before skins existed have no
 * `skin`; they continue to resolve to General with their original category.
 */

export interface UnitDefinition {
  value: string
  label: string
  short: string
  factor: number
}

export interface CategoryDefinition {
  value: UnitConverterCategory
  label: string
  units: readonly UnitDefinition[]
}

const unit = (
  value: string,
  label: string,
  factor: number,
  short = value,
): UnitDefinition => ({ value, label, short, factor })

const LINEAR_CATEGORIES: Readonly<Record<string, CategoryDefinition>> = {
  length: {
    value: 'length',
    label: 'Length',
    units: [
      unit('mm', 'Millimetres', 0.001),
      unit('cm', 'Centimetres', 0.01),
      unit('m', 'Metres', 1),
      unit('km', 'Kilometres', 1000),
      unit('in', 'Inches', 0.0254),
      unit('ft', 'Feet', 0.3048),
      unit('yd', 'Yards', 0.9144),
      unit('mi', 'Miles', 1609.344),
    ],
  },
  mass: {
    value: 'mass',
    label: 'Weight',
    units: [
      unit('mg', 'Milligrams', 0.000001),
      unit('g', 'Grams', 0.001),
      unit('kg', 'Kilograms', 1),
      unit('oz', 'Ounces', 0.028349523125),
      unit('lb', 'Pounds', 0.45359237),
      unit('t', 'Metric tonnes', 1000),
    ],
  },
  time: {
    value: 'time',
    label: 'Time',
    units: [
      unit('ms', 'Milliseconds', 0.001),
      unit('s', 'Seconds', 1),
      unit('min', 'Minutes', 60),
      unit('h', 'Hours', 3600),
      unit('day', 'Days', 86400),
      unit('week', 'Weeks', 604800),
    ],
  },
  cooking_volume: {
    value: 'cooking_volume',
    label: 'Volume',
    units: [
      unit('ml', 'Millilitres', 1, 'ml'),
      unit('l', 'Litres', 1000, 'L'),
      unit('tsp', 'Teaspoons (US)', 4.92892159375, 'tsp'),
      unit('tbsp', 'Tablespoons (US)', 14.78676478125, 'tbsp'),
      unit('fl_oz', 'Fluid ounces (US)', 29.5735295625, 'fl oz'),
      unit('cup', 'Cups (US)', 236.5882365, 'cup'),
      unit('pt', 'Pints (US)', 473.176473, 'pt'),
      unit('qt', 'Quarts (US)', 946.352946, 'qt'),
    ],
  },
  area: {
    value: 'area',
    label: 'Area',
    units: [
      unit('mm2', 'Square millimetres', 0.000001, 'mm²'),
      unit('cm2', 'Square centimetres', 0.0001, 'cm²'),
      unit('m2', 'Square metres', 1, 'm²'),
      unit('km2', 'Square kilometres', 1_000_000, 'km²'),
      unit('in2', 'Square inches', 0.00064516, 'in²'),
      unit('ft2', 'Square feet', 0.09290304, 'ft²'),
      unit('yd2', 'Square yards', 0.83612736, 'yd²'),
      unit('acre', 'Acres', 4046.8564224, 'ac'),
      unit('ha', 'Hectares', 10_000, 'ha'),
    ],
  },
  volume: {
    value: 'volume',
    label: 'Volume',
    units: [
      unit('cm3', 'Cubic centimetres', 0.000001, 'cm³'),
      unit('l', 'Litres', 0.001, 'L'),
      unit('m3', 'Cubic metres', 1, 'm³'),
      unit('in3', 'Cubic inches', 0.000016387064, 'in³'),
      unit('ft3', 'Cubic feet', 0.028316846592, 'ft³'),
      unit('yd3', 'Cubic yards', 0.764554857984, 'yd³'),
      unit('gal', 'Gallons (US)', 0.003785411784, 'gal'),
    ],
  },
  pressure: {
    value: 'pressure',
    label: 'Pressure',
    units: [
      unit('pa', 'Pascals', 1, 'Pa'),
      unit('kpa', 'Kilopascals', 1000, 'kPa'),
      unit('mpa', 'Megapascals', 1_000_000, 'MPa'),
      unit('bar', 'Bar', 100_000, 'bar'),
      unit('psi', 'Pounds per square inch', 6894.757293168, 'psi'),
      unit('atm', 'Atmospheres', 101_325, 'atm'),
    ],
  },
  energy: {
    value: 'energy',
    label: 'Energy',
    units: [
      unit('j', 'Joules', 1, 'J'),
      unit('kj', 'Kilojoules', 1000, 'kJ'),
      unit('cal', 'Calories', 4.184, 'cal'),
      unit('kcal', 'Kilocalories', 4184, 'kcal'),
      unit('wh', 'Watt-hours', 3600, 'Wh'),
      unit('kwh', 'Kilowatt-hours', 3_600_000, 'kWh'),
    ],
  },
  power: {
    value: 'power',
    label: 'Power',
    units: [
      unit('w', 'Watts', 1, 'W'),
      unit('kw', 'Kilowatts', 1000, 'kW'),
      unit('mw', 'Megawatts', 1_000_000, 'MW'),
      unit('hp', 'Mechanical horsepower', 745.699871582, 'hp'),
    ],
  },
  data_storage: {
    value: 'data_storage',
    label: 'Storage',
    units: [
      unit('bit', 'Bits', 0.125, 'bit'),
      unit('B', 'Bytes', 1, 'B'),
      unit('KB', 'Kilobytes', 1000, 'KB'),
      unit('MB', 'Megabytes', 1_000_000, 'MB'),
      unit('GB', 'Gigabytes', 1_000_000_000, 'GB'),
      unit('TB', 'Terabytes', 1_000_000_000_000, 'TB'),
      unit('KiB', 'Kibibytes', 1024, 'KiB'),
      unit('MiB', 'Mebibytes', 1_048_576, 'MiB'),
      unit('GiB', 'Gibibytes', 1_073_741_824, 'GiB'),
      unit('TiB', 'Tebibytes', 1_099_511_627_776, 'TiB'),
    ],
  },
  data_rate: {
    value: 'data_rate',
    label: 'Transfer',
    units: [
      unit('bps', 'Bits per second', 1, 'bps'),
      unit('Kbps', 'Kilobits per second', 1000, 'Kbps'),
      unit('Mbps', 'Megabits per second', 1_000_000, 'Mbps'),
      unit('Gbps', 'Gigabits per second', 1_000_000_000, 'Gbps'),
      unit('Bps', 'Bytes per second', 8, 'B/s'),
      unit('MBps', 'Megabytes per second', 8_000_000, 'MB/s'),
      unit('MiBps', 'Mebibytes per second', 8_388_608, 'MiB/s'),
    ],
  },
}

export const TEMPERATURE_CATEGORY: CategoryDefinition = {
  value: 'temperature',
  label: 'Temperature',
  units: [
    unit('C', 'Celsius', 1, '°C'),
    unit('F', 'Fahrenheit', 1, '°F'),
    unit('K', 'Kelvin', 1, 'K'),
  ],
}

const SPECIAL_CATEGORIES: Readonly<Record<'currency' | 'custom', CategoryDefinition>> = {
  currency: {
    value: 'currency',
    label: 'Currency',
    units: [
      unit('USD', 'Source currency', 1, 'USD'),
      unit('EUR', 'Target currency', 1, 'EUR'),
    ],
  },
  custom: {
    value: 'custom',
    label: 'Formula',
    units: [
      unit('input', 'Input unit', 1, 'input'),
      unit('output', 'Output unit', 1, 'output'),
    ],
  },
}

const CATEGORY_BY_VALUE: Readonly<Record<UnitConverterCategory, CategoryDefinition>> = {
  ...(LINEAR_CATEGORIES as Record<string, CategoryDefinition>),
  temperature: TEMPERATURE_CATEGORY,
  ...SPECIAL_CATEGORIES,
} as Record<UnitConverterCategory, CategoryDefinition>

const SKIN_CATEGORIES: Readonly<Record<UnitConverterSkin, readonly UnitConverterCategory[]>> = {
  general: ['length', 'mass', 'temperature', 'time'],
  cooking: ['cooking_volume', 'mass', 'temperature'],
  engineering: ['length', 'area', 'volume', 'pressure', 'energy', 'power'],
  data: ['data_storage', 'data_rate'],
  temperature: ['temperature'],
  currency: ['currency'],
  custom_formula: ['custom'],
}

const DEFAULT_CATEGORY: Readonly<Record<UnitConverterSkin, UnitConverterCategory>> = {
  general: 'length',
  cooking: 'cooking_volume',
  engineering: 'length',
  data: 'data_storage',
  temperature: 'temperature',
  currency: 'currency',
  custom_formula: 'custom',
}

const DEFAULT_PAIRS: Readonly<Record<UnitConverterCategory, readonly [string, string]>> = {
  length: ['m', 'ft'],
  mass: ['kg', 'lb'],
  temperature: ['C', 'F'],
  time: ['min', 'h'],
  cooking_volume: ['cup', 'ml'],
  area: ['m2', 'ft2'],
  volume: ['m3', 'ft3'],
  pressure: ['bar', 'psi'],
  energy: ['kwh', 'kj'],
  power: ['kw', 'hp'],
  data_storage: ['GB', 'GiB'],
  data_rate: ['Mbps', 'MBps'],
  currency: ['USD', 'EUR'],
  custom: ['input', 'output'],
}

export function unitConverterSkin(raw: unknown): UnitConverterSkin {
  return typeof raw === 'string' && raw in SKIN_CATEGORIES
    ? raw as UnitConverterSkin
    : 'general'
}

export function unitCategoriesForSkin(
  skin: UnitConverterSkin,
): readonly CategoryDefinition[] {
  return SKIN_CATEGORIES[skin].map((category) => CATEGORY_BY_VALUE[category])
}

export function defaultUnitPair(
  category: UnitConverterCategory,
): readonly [string, string] {
  return DEFAULT_PAIRS[category]
}

export interface CurrencySettings {
  rate: number
  fromCode: string
  toCode: string
  asOf: string
}

export interface CustomFormulaSettings {
  factor: number
  offset: number
  fromLabel: string
  toLabel: string
}

const finite = (raw: unknown, fallback = 0): number =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback

const bounded = (raw: unknown, fallback: number): number =>
  Math.max(-1_000_000_000_000, Math.min(1_000_000_000_000, finite(raw, fallback)))

const shortLabel = (raw: unknown, fallback: string): string => {
  if (typeof raw !== 'string') return fallback
  const cleaned = raw.trim().slice(0, 12)
  return cleaned || fallback
}

function stateFor(data: UnitConverterData, skin: UnitConverterSkin): Record<string, unknown> {
  const state = data.skinStates?.[skin]
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
}

export function currencySettings(data: UnitConverterData): CurrencySettings {
  const state = stateFor(data, 'currency')
  return {
    rate: Math.max(0, bounded(state.rate, 0.92)),
    fromCode: shortLabel(state.fromCode, 'USD').toUpperCase(),
    toCode: shortLabel(state.toCode, 'EUR').toUpperCase(),
    asOf: typeof state.asOf === 'string' ? state.asOf.slice(0, 10) : '',
  }
}

export function customFormulaSettings(data: UnitConverterData): CustomFormulaSettings {
  const state = stateFor(data, 'custom_formula')
  return {
    factor: bounded(state.factor, 1),
    offset: bounded(state.offset, 0),
    fromLabel: shortLabel(state.fromLabel, 'input'),
    toLabel: shortLabel(state.toLabel, 'output'),
  }
}

export function dataWithUnitSkinState(
  data: UnitConverterData,
  skin: 'currency',
  state: CurrencySettings,
): UnitConverterData
export function dataWithUnitSkinState(
  data: UnitConverterData,
  skin: 'custom_formula',
  state: CustomFormulaSettings,
): UnitConverterData
export function dataWithUnitSkinState(
  data: UnitConverterData,
  skin: 'currency' | 'custom_formula',
  state: CurrencySettings | CustomFormulaSettings,
): UnitConverterData {
  return {
    ...data,
    skinStates: {
      ...(data.skinStates ?? {}),
      [skin]: { ...state },
    },
  }
}

export interface UnitConverterReading {
  skin: UnitConverterSkin
  category: CategoryDefinition
  from: UnitDefinition
  to: UnitDefinition
  value: number
  output: number
}

function selectedUnit(
  category: CategoryDefinition,
  raw: string,
  fallbackIndex: number,
): UnitDefinition {
  return category.units.find((candidate) => candidate.value === raw)
    ?? category.units[fallbackIndex]
    ?? category.units[0]!
}

function convertTemperature(value: number, from: string, to: string): number {
  let celsius = value
  if (from === 'F') celsius = (value - 32) * (5 / 9)
  else if (from === 'K') celsius = value - 273.15
  if (to === 'F') return celsius * (9 / 5) + 32
  if (to === 'K') return celsius + 273.15
  return celsius
}

export function unitConverterReading(data: UnitConverterData): UnitConverterReading {
  const skin = unitConverterSkin(data.skin)
  const allowed = SKIN_CATEGORIES[skin]
  const categoryValue = allowed.includes(data.category)
    ? data.category
    : DEFAULT_CATEGORY[skin]
  const category = CATEGORY_BY_VALUE[categoryValue]
  const [defaultFrom, defaultTo] = DEFAULT_PAIRS[categoryValue]
  const from = selectedUnit(category, data.from, Math.max(0, category.units.findIndex((item) => item.value === defaultFrom)))
  const to = selectedUnit(category, data.to, Math.max(0, category.units.findIndex((item) => item.value === defaultTo)))
  const value = finite(data.value)

  let output: number
  if (categoryValue === 'temperature') {
    output = convertTemperature(value, from.value, to.value)
  } else if (categoryValue === 'currency') {
    output = value * currencySettings(data).rate
  } else if (categoryValue === 'custom') {
    const settings = customFormulaSettings(data)
    output = value * settings.factor + settings.offset
  } else {
    output = (value * from.factor) / to.factor
  }

  return {
    skin,
    category,
    from: categoryValue === 'currency'
      ? { ...from, value: currencySettings(data).fromCode, short: currencySettings(data).fromCode }
      : categoryValue === 'custom'
        ? { ...from, value: customFormulaSettings(data).fromLabel, short: customFormulaSettings(data).fromLabel }
        : from,
    to: categoryValue === 'currency'
      ? { ...to, value: currencySettings(data).toCode, short: currencySettings(data).toCode }
      : categoryValue === 'custom'
        ? { ...to, value: customFormulaSettings(data).toLabel, short: customFormulaSettings(data).toLabel }
        : to,
    value,
    output: Number.isFinite(output) ? output : 0,
  }
}

export function convertedUnit(data: UnitConverterData): number {
  return unitConverterReading(data).output
}

export function unitPrecision(raw: unknown): number {
  return Math.max(0, Math.min(8, Math.round(finite(raw, 2))))
}

export function formatUnitNumber(value: number, precision: number): string {
  const safe = Number.isFinite(value) ? value : 0
  const digits = unitPrecision(precision)
  if (safe !== 0 && (Math.abs(safe) >= 1e12 || Math.abs(safe) < 1e-7)) {
    return safe.toExponential(Math.min(digits, 6))
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    useGrouping: true,
  }).format(safe)
}

export function unitRateText(data: UnitConverterData): string {
  const reading = unitConverterReading({ ...data, value: 1 })
  return `1 ${reading.from.short} = ${formatUnitNumber(reading.output, Math.max(4, unitPrecision(data.precision)))} ${reading.to.short}`
}
