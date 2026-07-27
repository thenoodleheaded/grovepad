import {
  Asterisk,
  Check,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Hash,
  Heart,
  Link2,
  ListChecks,
  Minus,
  MessageSquare,
  PartyPopper,
  Plus,
  Star,
  ToggleLeft,
  Type,
  X,
} from 'lucide-react'
import { type ReactNode } from 'react'
import type {
  FormField,
  FormFieldType,
  FormSkinMode,
  FormWidgetData,
} from '../../../types/spatial'
import { WidgetPanel } from '../WidgetPanel'
import {
  applicationEvidence,
  applicationGroups,
  applicationReview,
  applicationSections,
  averageRating,
  conditionSources,
  conditionalFields,
  dataWithAddedField,
  dataWithApplicationDetail,
  dataWithApplicationReview,
  dataWithField,
  dataWithFieldCondition,
  dataWithInspectionCheck,
  dataWithoutField,
  defaultFormValue,
  fieldConditions,
  firstFieldOfType,
  formFieldFilled,
  formFields,
  formProgress,
  formSkinMode,
  inspectionCheck,
  inspectionChecks,
  inspectionResult,
  inspectionTally,
  ratingValue,
  RATING_MAX,
  type ConditionTest,
  type ReviewState,
} from './formSkinModel'

interface FormWidgetProps {
  data: FormWidgetData
  onChange: (data: FormWidgetData) => void
}

const FIELD_TYPES: readonly FormFieldType[] = ['text', 'number', 'checkbox']
const REVIEW_STATES: readonly ReviewState[] = ['draft', 'submitted', 'accepted', 'rejected']
const CONDITION_TESTS: readonly ConditionTest[] = ['answered', 'checked', 'unchecked']

const SKIN_COPY: Record<FormSkinMode, {
  eyebrow: string
  title: string
  add: string
  answer: string
}> = {
  intake: {
    eyebrow: 'Intake',
    title: 'What are you collecting?',
    add: 'Add field',
    answer: 'Answer…',
  },
  survey: {
    eyebrow: 'Survey',
    title: 'Name this survey',
    add: 'Add question',
    answer: 'Your answer…',
  },
  feedback: {
    eyebrow: 'Feedback',
    title: 'What are we rating?',
    add: 'Add prompt',
    answer: 'Tell us more…',
  },
  rsvp: {
    eyebrow: 'RSVP',
    title: 'Name the occasion',
    add: 'Add detail',
    answer: 'Your reply…',
  },
  inspection: {
    eyebrow: 'Inspection',
    title: 'What is being inspected?',
    add: 'Add check',
    answer: 'Observation…',
  },
  application: {
    eyebrow: 'Application',
    title: 'What is being applied for?',
    add: 'Add question',
    answer: 'Your answer…',
  },
  conditional_form: {
    eyebrow: 'Branching form',
    title: 'Name this form',
    add: 'Add question',
    answer: 'Your answer…',
  },
}

function skinIcon(skin: FormSkinMode): ReactNode {
  if (skin === 'survey') return <ListChecks size={12} aria-hidden />
  if (skin === 'feedback') return <MessageSquare size={12} aria-hidden />
  if (skin === 'rsvp') return <PartyPopper size={12} aria-hidden />
  if (skin === 'inspection') return <ClipboardCheck size={12} aria-hidden />
  if (skin === 'application') return <FileCheck2 size={12} aria-hidden />
  if (skin === 'conditional_form') return <Link2 size={12} aria-hidden />
  return <ClipboardList size={12} aria-hidden />
}

function typeIcon(type: FormFieldType): ReactNode {
  if (type === 'number') return <Hash size={9} aria-hidden />
  if (type === 'checkbox') return <ToggleLeft size={9} aria-hidden />
  return <Type size={9} aria-hidden />
}

export function FormWidget({ data, onChange }: FormWidgetProps) {
  const skin = formSkinMode(data.skin)
  const copy = SKIN_COPY[skin]
  const fields = formFields(data.fields)
  const progress = formProgress(fields)

  const base = (): FormWidgetData => ({ ...data, skin, fields })
  const setField = (id: string, patch: Partial<FormField>) =>
    onChange(dataWithField(base(), id, patch))
  const addField = () => onChange(dataWithAddedField(base(), skin))
  const removeField = (id: string) => onChange(dataWithoutField(base(), id))

  const labelInput = (field: FormField, placeholder = 'Question') => (
    <div className="gp-bare-field gp-form-label-field">
      <input
        value={field.label}
        placeholder={placeholder}
        aria-label="Question label"
        onChange={(event) => setField(field.id, { label: event.target.value })}
      />
    </div>
  )

  const requiredToggle = (field: FormField) => (
    <button
      type="button"
      className="gp-form-required"
      aria-pressed={field.required}
      aria-label={`${field.label || 'This question'} is ${field.required ? 'required' : 'optional'}`}
      title={field.required ? 'Required' : 'Optional'}
      onClick={() => setField(field.id, { required: !field.required })}
    >
      <Asterisk size={9} aria-hidden />
    </button>
  )

  const typeSelect = (field: FormField) => (
    <label className="gp-form-type">
      <span className="gp-sr-only">Answer type</span>
      {typeIcon(field.type)}
      <select
        value={field.type}
        aria-label="Answer type"
        onChange={(event) => {
          const type = event.target.value as FormFieldType
          setField(field.id, { type, value: defaultFormValue(type) })
        }}
      >
        {FIELD_TYPES.map((type) => (
          <option key={type} value={type}>
            {type === 'checkbox' ? 'Yes / no' : type === 'number' ? 'Number' : 'Text'}
          </option>
        ))}
      </select>
    </label>
  )

  const removeButton = (field: FormField) => (
    <button
      type="button"
      className="gp-form-remove"
      aria-label={`Remove ${field.label || 'this question'}`}
      onClick={() => removeField(field.id)}
    >
      <X size={10} aria-hidden />
    </button>
  )

  const answerControl = (field: FormField, placeholder = copy.answer) => {
    if (field.type === 'checkbox') {
      const checked = field.value === true
      return (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={field.label || 'Confirm'}
          className="gp-form-check"
          onClick={() => setField(field.id, { value: !checked })}
        >
          <span aria-hidden>{checked && <Check size={9} />}</span>
          {checked ? 'Yes' : 'No'}
        </button>
      )
    }
    return (
      <div className="gp-bare-field gp-form-answer">
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={field.value as string | number}
          placeholder={placeholder}
          aria-label={field.label || 'Answer'}
          onChange={(event) => setField(field.id, {
            value: field.type === 'number'
              ? Number(event.target.value)
              : event.target.value,
          })}
        />
      </div>
    )
  }

  const addButton = () => (
    <button type="button" className="gp-form-add" onClick={addField}>
      <Plus size={10} aria-hidden />
      {copy.add}
    </button>
  )

  const ratingRow = (field: FormField) => {
    const score = ratingValue(field)
    return (
      <div className="gp-form-rating" role="group" aria-label={field.label || 'Rating'}>
        {Array.from({ length: RATING_MAX }, (_unused, index) => {
          const value = index + 1
          return (
            <button
              key={value}
              type="button"
              aria-pressed={value <= score}
              aria-label={`${value} of ${RATING_MAX}`}
              onClick={() => setField(field.id, { value: score === value ? 0 : value })}
            >
              <Star size={13} aria-hidden fill={value <= score ? 'currentColor' : 'none'} />
            </button>
          )
        })}
        <b>{score > 0 ? `${score}/${RATING_MAX}` : '—'}</b>
      </div>
    )
  }

  let content: ReactNode

  if (skin === 'survey') {
    content = (
      <div className="gp-form-list gp-form-survey">
        {fields.map((field, index) => (
          <WidgetPanel
            key={field.id}
            grip={false}
            floor="controls"
            className={`gp-form-question${formFieldFilled(field) ? ' gp-form-question-done' : ''}`}
          >
            <header>
              <span className="gp-form-step" aria-hidden>{index + 1}</span>
              {labelInput(field, `Question ${index + 1}`)}
              {requiredToggle(field)}
              {typeSelect(field)}
              {removeButton(field)}
            </header>
            {answerControl(field)}
          </WidgetPanel>
        ))}
        {addButton()}
      </div>
    )
  } else if (skin === 'feedback') {
    const average = averageRating(fields)
    content = (
      <div className="gp-form-list gp-form-feedback">
        <div className="gp-form-score">
          <Heart size={12} aria-hidden />
          <b>{average === null ? '—' : average.toFixed(1)}</b>
          <span>average score</span>
        </div>
        {fields.map((field) => (
          <WidgetPanel key={field.id} grip={false} floor="controls" className="gp-form-prompt">
            <header>
              {labelInput(field, 'What are we asking about?')}
              {requiredToggle(field)}
              {typeSelect(field)}
              {removeButton(field)}
            </header>
            {field.type === 'number' ? ratingRow(field) : answerControl(field, 'Tell us more…')}
          </WidgetPanel>
        ))}
        {addButton()}
      </div>
    )
  } else if (skin === 'rsvp') {
    const attendance = firstFieldOfType(fields, 'checkbox')
    const guests = firstFieldOfType(fields, 'number')
    const rest = fields.filter((field) => field.id !== attendance?.id && field.id !== guests?.id)
    const attending = attendance?.value === true
    content = (
      <div className="gp-form-rsvp">
          {attendance && (
            <WidgetPanel grip={false} floor="rigid" className="gp-form-attendance">
              {labelInput(attendance, 'Will you be there?')}
              <div className="gp-form-reply" role="group" aria-label="Attendance">
                <button
                  type="button"
                  aria-pressed={attending}
                  className="gp-form-reply-yes"
                  onClick={() => setField(attendance.id, { value: true })}
                >
                  <Check size={11} aria-hidden />
                  Going
                </button>
                <button
                  type="button"
                  aria-pressed={!attending}
                  className="gp-form-reply-no"
                  onClick={() => setField(attendance.id, { value: false })}
                >
                  <X size={11} aria-hidden />
                  Can’t make it
                </button>
              </div>
            </WidgetPanel>
          )}

          {guests && (
            <WidgetPanel grip={false} floor="rigid" className="gp-form-guests">
              {labelInput(guests, 'Plus-ones')}
              <div className="gp-form-stepper">
                <button
                  type="button"
                  aria-label="One fewer guest"
                  disabled={Number(guests.value ?? 0) <= 0}
                  onClick={() => setField(guests.id, {
                    value: Math.max(0, Number(guests.value ?? 0) - 1),
                  })}
                >
                  <Minus size={10} aria-hidden />
                </button>
                <output aria-label="Guest count">{Number(guests.value ?? 0)}</output>
                <button
                  type="button"
                  aria-label="One more guest"
                  onClick={() => setField(guests.id, {
                    value: Number(guests.value ?? 0) + 1,
                  })}
                >
                  <Plus size={10} aria-hidden />
                </button>
              </div>
            </WidgetPanel>
          )}

          <div className="gp-form-list">
            {rest.map((field) => (
              <WidgetPanel key={field.id} grip={false} floor="controls" className="gp-form-row">
                <header>
                  {labelInput(field, 'Dietary needs, message…')}
                  {requiredToggle(field)}
                  {typeSelect(field)}
                  {removeButton(field)}
                </header>
                {answerControl(field)}
              </WidgetPanel>
            ))}
            {addButton()}
          </div>
      </div>
    )
  } else if (skin === 'inspection') {
    const checks = inspectionChecks(data)
    const tally = inspectionTally(fields, checks)
    content = (
      <div className="gp-form-list gp-form-inspection">
        <div className="gp-form-tally">
          <span data-result="pass"><b>{tally.pass}</b>pass</span>
          <span data-result="fail"><b>{tally.fail}</b>fail</span>
          <span data-result="na"><b>{tally.na}</b>n/a</span>
        </div>
        {fields.map((field) => {
          const check = inspectionCheck(checks, field.id)
          const result = inspectionResult(field, check)
          return (
            <WidgetPanel
              key={field.id}
              grip={false}
              floor="controls"
              className={`gp-form-check-row gp-form-check-${result}`}
            >
              <header>
                <span className="gp-form-verdict" aria-hidden>
                  {result === 'pass' ? <Check size={10} /> : result === 'fail' ? <X size={10} /> : <Minus size={10} />}
                </span>
                {labelInput(field, 'What is being checked?')}
                {requiredToggle(field)}
                <div className="gp-form-verdicts" role="group" aria-label="Result">
                  <button
                    type="button"
                    aria-pressed={result === 'pass'}
                    aria-label="Pass"
                    className="gp-form-verdict-pass"
                    onClick={() => onChange(dataWithInspectionCheck(
                      dataWithField(base(), field.id, { type: 'checkbox', value: true }),
                      field.id,
                      { skipped: false },
                    ))}
                  >
                    Pass
                  </button>
                  <button
                    type="button"
                    aria-pressed={result === 'fail'}
                    aria-label="Fail"
                    className="gp-form-verdict-fail"
                    onClick={() => onChange(dataWithInspectionCheck(
                      dataWithField(base(), field.id, { type: 'checkbox', value: false }),
                      field.id,
                      { skipped: false },
                    ))}
                  >
                    Fail
                  </button>
                  <button
                    type="button"
                    aria-pressed={result === 'na'}
                    aria-label="Not applicable"
                    className="gp-form-verdict-na"
                    onClick={() => onChange(dataWithInspectionCheck(
                      base(),
                      field.id,
                      { skipped: !check.skipped },
                    ))}
                  >
                    N/A
                  </button>
                </div>
                {removeButton(field)}
              </header>
              <label className="gp-form-note gp-bare-field">
                <span className="gp-sr-only">Inspector note</span>
                <input
                  value={check.note}
                  placeholder={result === 'fail' ? 'What went wrong?' : 'Observation…'}
                  aria-label={`Note for ${field.label || 'this check'}`}
                  onChange={(event) => onChange(dataWithInspectionCheck(
                    base(),
                    field.id,
                    { note: event.target.value },
                  ))}
                />
              </label>
            </WidgetPanel>
          )
        })}
        {addButton()}
      </div>
    )
  } else if (skin === 'application') {
    const sections = applicationSections(data)
    const evidence = applicationEvidence(data)
    const review = applicationReview(data)
    content = (
      <div className="gp-form-list gp-form-application">
        <div className="gp-form-review" role="group" aria-label="Review state">
          {REVIEW_STATES.map((state) => (
            <button
              key={state}
              type="button"
              data-state={state}
              aria-pressed={review === state}
              onClick={() => onChange(dataWithApplicationReview(base(), state))}
            >
              {state}
            </button>
          ))}
        </div>
        {applicationGroups(fields, sections).map((group) => (
          <section key={group.label} className="gp-form-section">
            <h4>{group.label}</h4>
            {group.fields.map((field) => (
              <WidgetPanel key={field.id} grip={false} floor="controls" className="gp-form-row">
                <header>
                  {labelInput(field)}
                  {requiredToggle(field)}
                  {typeSelect(field)}
                  {removeButton(field)}
                </header>
                {answerControl(field)}
                <div className="gp-form-meta">
                  <label className="gp-bare-field">
                    <span>Section</span>
                    <input
                      value={sections[field.id] ?? ''}
                      placeholder="General"
                      aria-label={`Section for ${field.label || 'this question'}`}
                      onChange={(event) => onChange(dataWithApplicationDetail(
                        base(),
                        field.id,
                        { section: event.target.value },
                      ))}
                    />
                  </label>
                  <label className="gp-bare-field">
                    <span>Evidence required</span>
                    <input
                      value={evidence[field.id] ?? ''}
                      placeholder="Document, link, or reference"
                      aria-label={`Evidence for ${field.label || 'this question'}`}
                      onChange={(event) => onChange(dataWithApplicationDetail(
                        base(),
                        field.id,
                        { evidence: event.target.value },
                      ))}
                    />
                  </label>
                </div>
              </WidgetPanel>
            ))}
          </section>
        ))}
        {addButton()}
      </div>
    )
  } else if (skin === 'conditional_form') {
    const conditions = fieldConditions(data)
    content = (
      <div className="gp-form-list gp-form-conditional">
        {conditionalFields(fields, conditions).map(({ field, condition, visible }) => {
          const sources = conditionSources(fields, field.id)
          return (
            <WidgetPanel
              key={field.id}
              grip={false}
              floor="controls"
              className={`gp-form-row gp-form-gated${visible ? '' : ' gp-form-gated-hidden'}`}
            >
              <header>
                {labelInput(field)}
                {requiredToggle(field)}
                {typeSelect(field)}
                {removeButton(field)}
              </header>
              {visible
                ? answerControl(field)
                : <p className="gp-form-gated-note">Hidden until the rule below is met.</p>}
              {sources.length > 0 && (
                <div className="gp-form-rule">
                  <Link2 size={9} aria-hidden />
                  <span>Show when</span>
                  <select
                    value={condition?.sourceId ?? ''}
                    aria-label={`Question that reveals ${field.label || 'this question'}`}
                    onChange={(event) => onChange(dataWithFieldCondition(
                      base(),
                      field.id,
                      event.target.value
                        ? { sourceId: event.target.value, test: condition?.test ?? 'answered' }
                        : null,
                    ))}
                  >
                    <option value="">always</option>
                    {sources.map((source, index) => (
                      <option key={source.id} value={source.id}>
                        {source.label || `Question ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  {condition && (
                    <select
                      value={condition.test}
                      aria-label={`Condition for ${field.label || 'this question'}`}
                      onChange={(event) => onChange(dataWithFieldCondition(
                        base(),
                        field.id,
                        { sourceId: condition.sourceId, test: event.target.value as ConditionTest },
                      ))}
                    >
                      {CONDITION_TESTS.map((test) => (
                        <option key={test} value={test}>
                          {test === 'answered' ? 'is answered' : test === 'checked' ? 'is yes' : 'is no'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </WidgetPanel>
          )
        })}
        {addButton()}
      </div>
    )
  } else {
    content = (
      <div className="gp-form-list gp-form-intake">
        {fields.map((field) => (
          <WidgetPanel key={field.id} grip={false} floor="controls" className="gp-form-row">
            <header>
              {labelInput(field)}
              {requiredToggle(field)}
              {typeSelect(field)}
              {removeButton(field)}
            </header>
            {answerControl(field)}
          </WidgetPanel>
        ))}
        {addButton()}
      </div>
    )
  }

  return (
    <FormShell
      skin={skin}
      copy={copy}
      data={data}
      base={base}
      onChange={onChange}
      progress={progress}
    >
      {content}
    </FormShell>
  )
}

/**
 * Title, completion, and the progress rail are the same promise in every skin:
 * how much of this form is done, and can it be handed over yet.
 */
function FormShell({
  skin,
  copy,
  data,
  base,
  onChange,
  progress,
  children,
}: {
  skin: FormSkinMode
  copy: (typeof SKIN_COPY)[FormSkinMode]
  data: FormWidgetData
  base: () => FormWidgetData
  onChange: (data: FormWidgetData) => void
  progress: ReturnType<typeof formProgress>
  children: ReactNode
}) {
  return (
    <div className="gp-form" data-form-skin={skin}>
      <header className="gp-form-header">
        <span className="gp-form-eyebrow">
          {skinIcon(skin)}
          {copy.eyebrow}
        </span>
        <span
          className="gp-form-status"
          data-complete={progress.complete || undefined}
        >
          {progress.complete ? 'Ready' : `${progress.filled}/${progress.total}`}
        </span>
      </header>

      <WidgetPanel grip={false} floor="rigid" className="gp-form-title">
        <div className="gp-bare-field">
          <input
            value={data.title}
            placeholder={copy.title}
            aria-label="Form title"
            onChange={(event) => onChange({ ...base(), title: event.target.value })}
          />
        </div>
        <div
          className="gp-form-rail"
          role="img"
          aria-label={`${progress.filled} of ${progress.total} answered`}
        >
          <span style={{ inlineSize: `${progress.percent}%` }} />
        </div>
      </WidgetPanel>

      {children}
    </div>
  )
}
