import {
  ArrowLeftRight,
  Binary,
  Check,
  ChefHat,
  CircleDollarSign,
  Copy,
  Minus,
  Plus,
  Ruler,
  Sparkles,
  SquareFunction,
  ThermometerSun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTransientValue } from '../../../hooks/useTransientValue'
import type {
  UnitConverterCategory,
  UnitConverterData,
  UnitConverterSkin,
} from '../../../types/widgetDataExpansion'
import {
  currencySettings,
  customFormulaSettings,
  dataWithUnitSkinState,
  defaultUnitPair,
  formatUnitNumber,
  unitCategoriesForSkin,
  unitConverterReading,
  unitPrecision,
  unitRateText,
} from './unitConverterSkinModel'

interface UnitConverterWidgetProps {
  data: UnitConverterData
  onChange: (data: UnitConverterData) => void
}

const SKIN_COPY: Readonly<Record<UnitConverterSkin, {
  label: string
  eyebrow: string
  icon: LucideIcon
}>> = {
  general: { label: 'General', eyebrow: 'Everyday measures', icon: Sparkles },
  cooking: { label: 'Cooking', eyebrow: 'Recipe bench', icon: ChefHat },
  engineering: { label: 'Engineering', eyebrow: 'Technical conversion', icon: Ruler },
  data: { label: 'Data', eyebrow: 'Digital scale', icon: Binary },
  temperature: { label: 'Temperature', eyebrow: 'Thermal reading', icon: ThermometerSun },
  currency: { label: 'Currency', eyebrow: 'Manual exchange', icon: CircleDollarSign },
  custom_formula: { label: 'Custom Formula', eyebrow: 'Your conversion rule', icon: SquareFunction },
}

function ConverterHeader({
  skin,
  category,
}: {
  skin: UnitConverterSkin
  category: string
}) {
  const copy = SKIN_COPY[skin]
  const Icon = copy.icon
  return (
    <header className="gp-uc-head">
      <span className="gp-uc-glyph" aria-hidden><Icon size={15} /></span>
      <span className="gp-uc-heading">
        <span>{copy.eyebrow}</span>
        <strong>{copy.label}</strong>
      </span>
      <span className="gp-uc-category-badge">{category}</span>
    </header>
  )
}

function CategoryTabs({
  data,
  onChange,
}: UnitConverterWidgetProps) {
  const reading = unitConverterReading(data)
  const categories = unitCategoriesForSkin(reading.skin)
  if (categories.length < 2) return null

  const choose = (category: UnitConverterCategory) => {
    const [from, to] = defaultUnitPair(category)
    onChange({ ...data, category, from, to })
  }

  return (
    <div className="gp-uc-categories" role="group" aria-label={`${SKIN_COPY[reading.skin].label} conversion category`}>
      {categories.map((category) => (
        <button
          key={category.value}
          type="button"
          aria-pressed={reading.category.value === category.value}
          onClick={() => choose(category.value)}
        >
          {category.label}
        </button>
      ))}
    </div>
  )
}

function UnitSelect({
  label,
  value,
  units,
  onChange,
}: {
  label: string
  value: string
  units: ReturnType<typeof unitConverterReading>['category']['units']
  onChange: (value: string) => void
}) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {units.map((candidate) => (
        <option key={candidate.value} value={candidate.value}>
          {candidate.label} · {candidate.short}
        </option>
      ))}
    </select>
  )
}

function ConversionStage({
  data,
  onChange,
  onSwap,
  swapDisabled = false,
}: UnitConverterWidgetProps & {
  onSwap: () => void
  swapDisabled?: boolean
}) {
  const reading = unitConverterReading(data)
  const precision = unitPrecision(data.precision)
  const formatted = formatUnitNumber(reading.output, precision)
  const [copied, showCopied] = useTransientValue(false)
  const special = reading.category.value === 'currency' || reading.category.value === 'custom'

  const persistUnits = (from: string, to: string) => {
    onChange({ ...data, category: reading.category.value, from, to })
  }

  return (
    <div className="gp-uc-stage" data-category={reading.category.value}>
      <label className="gp-uc-side gp-uc-side--input gp-bare-field">
        <span className="gp-uc-side-label">Input</span>
        <span className="gp-uc-value-row">
          <input
            aria-label="Value to convert"
            type="number"
            inputMode="decimal"
            step="any"
            value={Number.isFinite(data.value) ? data.value : 0}
            onChange={(event) => onChange({ ...data, value: Number(event.target.value) || 0 })}
            onFocus={(event) => event.currentTarget.select()}
          />
          {special && <em>{reading.from.short}</em>}
        </span>
        {!special && (
          <UnitSelect
            label="Source unit"
            value={reading.from.value}
            units={reading.category.units}
            onChange={(from) => persistUnits(from, reading.to.value)}
          />
        )}
        {special && <span className="gp-uc-unit-name">{reading.from.short}</span>}
      </label>

      <button
        type="button"
        className="gp-uc-swap"
        aria-label="Swap units"
        title={swapDisabled ? 'This formula cannot be reversed while its factor is zero' : 'Swap direction'}
        disabled={swapDisabled}
        onClick={onSwap}
      >
        <ArrowLeftRight size={15} aria-hidden />
      </button>

      <div className="gp-uc-side gp-uc-side--output gp-flat-visual-own">
        <span className="gp-uc-side-label">Converted</span>
        <span className="gp-uc-value-row">
          <output title={`${formatted} ${reading.to.short}`}>{formatted}</output>
          <em>{reading.to.short}</em>
        </span>
        <span className="gp-uc-output-foot">
          {!special && (
            <UnitSelect
              label="Target unit"
              value={reading.to.value}
              units={reading.category.units}
              onChange={(to) => persistUnits(reading.from.value, to)}
            />
          )}
          {special && <span className="gp-uc-unit-name">{reading.to.short}</span>}
          <button
            type="button"
            className="gp-uc-copy"
            data-copied={copied || undefined}
            aria-label="Copy converted output"
            title={copied ? 'Copied' : 'Copy output'}
            onClick={() => {
              void navigator.clipboard?.writeText(formatted)
              showCopied(true, 1400)
            }}
          >
            {copied ? <Check size={12} aria-hidden /> : <Copy size={11} aria-hidden />}
            <span className="sr-only" role="status" aria-live="polite">
              {copied ? 'Converted output copied' : ''}
            </span>
          </button>
        </span>
      </div>
    </div>
  )
}

function PrecisionRail({
  data,
  onChange,
  note,
}: UnitConverterWidgetProps & { note?: string }) {
  const precision = unitPrecision(data.precision)
  const set = (next: number) => onChange({ ...data, precision: unitPrecision(next) })
  return (
    <footer className="gp-uc-footer">
      <span className="gp-uc-rate" title={unitRateText(data)}>{note ?? unitRateText(data)}</span>
      <span className="gp-uc-precision" role="group" aria-label="Decimal precision">
        <span>Decimals</span>
        <button type="button" aria-label="Decrease decimal precision" disabled={precision === 0} onClick={() => set(precision - 1)}>
          <Minus size={10} aria-hidden />
        </button>
        <output aria-label={`${precision} decimal places`}>{precision}</output>
        <button type="button" aria-label="Increase decimal precision" disabled={precision === 8} onClick={() => set(precision + 1)}>
          <Plus size={10} aria-hidden />
        </button>
      </span>
    </footer>
  )
}

function GeneralDetail({ data }: { data: UnitConverterData }) {
  const reading = unitConverterReading(data)
  return (
    <div className="gp-uc-detail gp-uc-detail--general" aria-hidden>
      <span>{reading.from.short}</span>
      <i />
      <span>{reading.category.label}</span>
      <i />
      <span>{reading.to.short}</span>
    </div>
  )
}

function CookingDetail() {
  return (
    <div className="gp-uc-detail gp-uc-detail--cooking" aria-label="Kitchen reference">
      <span><i aria-hidden>⅓</i> cup</span>
      <span><i aria-hidden>½</i> tbsp</span>
      <span><i aria-hidden>¾</i> tsp</span>
    </div>
  )
}

function EngineeringDetail({ data }: { data: UnitConverterData }) {
  const reading = unitConverterReading(data)
  return (
    <div className="gp-uc-detail gp-uc-detail--engineering" aria-hidden>
      <span>REF</span>
      <code>{reading.from.short}</code>
      <i>×</i>
      <code>{formatUnitNumber(reading.from.factor / reading.to.factor, 6)}</code>
      <i>=</i>
      <code>{reading.to.short}</code>
    </div>
  )
}

function DataDetail({ data }: { data: UnitConverterData }) {
  const binary = unitConverterReading(data).category.value === 'data_storage'
  return (
    <div className="gp-uc-detail gp-uc-detail--data">
      <span><i aria-hidden>10</i><strong>Decimal</strong><em>powers of 1000</em></span>
      <span data-active={binary || undefined}><i aria-hidden>01</i><strong>Binary</strong><em>powers of 1024</em></span>
      <span><i aria-hidden>8</i><strong>Bits</strong><em>make one byte</em></span>
    </div>
  )
}

function TemperatureDetail() {
  return (
    <div className="gp-uc-detail gp-uc-detail--temperature" aria-hidden>
      <span>Cold</span>
      <i><b /></i>
      <span>Hot</span>
    </div>
  )
}

function CurrencyDetail({ data, onChange }: UnitConverterWidgetProps) {
  const settings = currencySettings(data)
  const patch = (next: Partial<typeof settings>) => {
    onChange(dataWithUnitSkinState(data, 'currency', { ...settings, ...next }))
  }
  return (
    <div className="gp-uc-detail gp-uc-detail--currency">
      <label className="gp-bare-field">
        <span>From</span>
        <input aria-label="Source currency code" value={settings.fromCode} maxLength={12} onChange={(event) => patch({ fromCode: event.target.value.toUpperCase() })} />
      </label>
      <label className="gp-bare-field gp-uc-rate-field">
        <span>Manual rate</span>
        <input aria-label="Exchange rate" type="number" inputMode="decimal" min={0} step="any" value={settings.rate} onChange={(event) => patch({ rate: Math.max(0, Number(event.target.value) || 0) })} />
      </label>
      <label className="gp-bare-field">
        <span>To</span>
        <input aria-label="Target currency code" value={settings.toCode} maxLength={12} onChange={(event) => patch({ toCode: event.target.value.toUpperCase() })} />
      </label>
      <label className="gp-bare-field gp-uc-date-field">
        <span>Rate date</span>
        <input aria-label="Exchange rate date" type="date" value={settings.asOf} onChange={(event) => patch({ asOf: event.target.value })} />
      </label>
    </div>
  )
}

function CustomFormulaDetail({ data, onChange }: UnitConverterWidgetProps) {
  const settings = customFormulaSettings(data)
  const patch = (next: Partial<typeof settings>) => {
    onChange(dataWithUnitSkinState(data, 'custom_formula', { ...settings, ...next }))
  }
  return (
    <div className="gp-uc-detail gp-uc-detail--formula">
      <div className="gp-uc-formula-preview" aria-label="Conversion formula">
        <span>output</span><i>=</i><strong>input</strong><i>×</i><b>{formatUnitNumber(settings.factor, 5)}</b><i>{settings.offset < 0 ? '−' : '+'}</i><b>{formatUnitNumber(Math.abs(settings.offset), 5)}</b>
      </div>
      <div className="gp-uc-formula-fields">
        <label className="gp-bare-field"><span>Input name</span><input aria-label="Custom input unit name" value={settings.fromLabel} maxLength={12} onChange={(event) => patch({ fromLabel: event.target.value })} /></label>
        <label className="gp-bare-field"><span>Factor</span><input aria-label="Custom conversion factor" type="number" inputMode="decimal" step="any" value={settings.factor} onChange={(event) => patch({ factor: Number(event.target.value) || 0 })} /></label>
        <label className="gp-bare-field"><span>Offset</span><input aria-label="Custom conversion offset" type="number" inputMode="decimal" step="any" value={settings.offset} onChange={(event) => patch({ offset: Number(event.target.value) || 0 })} /></label>
        <label className="gp-bare-field"><span>Output name</span><input aria-label="Custom output unit name" value={settings.toLabel} maxLength={12} onChange={(event) => patch({ toLabel: event.target.value })} /></label>
      </div>
    </div>
  )
}

export function UnitConverterWidget({ data, onChange }: UnitConverterWidgetProps) {
  const reading = unitConverterReading(data)
  const currency = reading.skin === 'currency' ? currencySettings(data) : null
  const formula = reading.skin === 'custom_formula' ? customFormulaSettings(data) : null

  const swap = () => {
    if (currency) {
      onChange(dataWithUnitSkinState(data, 'currency', {
        ...currency,
        fromCode: currency.toCode,
        toCode: currency.fromCode,
        rate: currency.rate > 0 ? 1 / currency.rate : 0,
      }))
      return
    }
    if (formula) {
      if (formula.factor === 0) return
      onChange(dataWithUnitSkinState(data, 'custom_formula', {
        ...formula,
        fromLabel: formula.toLabel,
        toLabel: formula.fromLabel,
        factor: 1 / formula.factor,
        offset: -formula.offset / formula.factor,
      }))
      return
    }
    onChange({
      ...data,
      category: reading.category.value,
      from: reading.to.value,
      to: reading.from.value,
    })
  }

  return (
    <div className="gp-uc" data-uc-skin={reading.skin}>
      <ConverterHeader skin={reading.skin} category={reading.category.label} />
      <CategoryTabs data={data} onChange={onChange} />
      <ConversionStage
        data={data}
        onChange={onChange}
        onSwap={swap}
        swapDisabled={formula?.factor === 0}
      />

      {reading.skin === 'general' && <GeneralDetail data={data} />}
      {reading.skin === 'cooking' && <CookingDetail />}
      {reading.skin === 'engineering' && <EngineeringDetail data={data} />}
      {reading.skin === 'data' && <DataDetail data={data} />}
      {reading.skin === 'temperature' && <TemperatureDetail />}
      {reading.skin === 'currency' && <CurrencyDetail data={data} onChange={onChange} />}
      {reading.skin === 'custom_formula' && <CustomFormulaDetail data={data} onChange={onChange} />}

      <PrecisionRail
        data={data}
        onChange={onChange}
        note={currency ? `${currency.rate ? `1 ${currency.fromCode} = ${formatUnitNumber(currency.rate, 6)} ${currency.toCode}` : 'Enter a manual exchange rate'}${currency.asOf ? ` · ${currency.asOf}` : ' · add a rate date'}` : undefined}
      />
    </div>
  )
}
