import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  AtSign,
  Cake,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Globe,
  Hash,
  HeartPulse,
  House,
  MapPin,
  MessageSquare,
  Minus,
  Phone,
  Plus,
  Siren,
  StickyNote,
  Stethoscope,
  Tag,
  TriangleAlert,
  UserPlus,
  X,
} from 'lucide-react'
import type { ContactData, ModuleData } from '../../../types/spatial'
import { useSharedClock } from '../../../hooks/useSharedClock'
import { dataWithSkinState, skinStateFor } from '../../../utils/widgetSkins'
import { WidgetPanel } from '../WidgetPanel'
import { withoutPanelItem } from '../panelRemoval'
import {
  birthdayReading,
  cadenceDueLabel,
  cadenceLabel,
  cadenceReading,
  CARE_ESCALATION_LIMIT,
  careState,
  CADENCE_LIMIT,
  contactFields,
  contactSkin,
  dayKey,
  displayName,
  escalationLabel,
  HOUSEHOLD_LIMIT,
  householdState,
  initialsOf,
  mailHref,
  reachRoutes,
  relationshipState,
  siteHref,
  siteLabel,
  telHref,
  type ContactChannel,
  type ContactSkin,
  type ReachKind,
} from './contactSkinModel'

interface ContactWidgetProps {
  data: ContactData
  onChange: (data: ContactData) => void
  skin?: ContactSkin
}

const ROUTE_ICONS: Record<ReachKind, typeof Phone> = {
  phone: Phone,
  text: MessageSquare,
  email: AtSign,
  site: Globe,
}

const CHANNELS: { value: ContactChannel; label: string }[] = [
  { value: 'phone', label: 'Call' },
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
]

/** One person, worn seven different ways. */
export function ContactWidget({ data, onChange, skin: requestedSkin }: ContactWidgetProps) {
  const skin = requestedSkin ?? contactSkin(data.skin)
  const fields = contactFields(data)
  const initials = initialsOf(fields.name)
  // Household rows wait for the panel's exit transition, so a person fades
  // out instead of the roster snapping shut under the pointer.
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set())

  // Only the two faces that count days need a clock, and a minute is fine —
  // neither a birthday nor an overdue call changes between seconds.
  const tick = useSharedClock(
    60_000,
    skin === 'personal' || skin === 'relationship',
    true,
  )
  const now = new Date(tick)

  const base = (next: Partial<ContactData> = {}): ContactData => ({ ...data, skin, ...next })
  const write = (next: Partial<ContactData>) => onChange(base(next))
  const writeState = (
    value: string,
    state: Record<string, unknown>,
    next: Partial<ContactData> = {},
  ) => onChange(dataWithSkinState(base(next) as ModuleData, value, state) as ContactData)

  const field = (
    key: 'name' | 'role' | 'email' | 'phone' | 'organization' | 'address'
      | 'website' | 'note' | 'birthday' | 'reference',
  ) => ({
    value: fields[key],
    onChange: (event: { target: { value: string } }) => write({ [key]: event.target.value }),
  })

  /** A labelled line inside one of the authored surfaces. */
  const line = (
    key: Parameters<typeof field>[0],
    label: string,
    icon: ReactNode,
    placeholder: string,
    type = 'text',
  ) => (
    <label className="gp-contact-line gp-bare-field">
      <span className="gp-contact-line-icon" aria-hidden>{icon}</span>
      <span className="gp-contact-line-label">{label}</span>
      <input
        type={type}
        aria-label={label}
        placeholder={placeholder}
        className="gp-input--bare"
        {...field(key)}
      />
    </label>
  )

  const nameField = (
    <input
      aria-label="Name"
      placeholder="Name"
      className="gp-contact-name gp-input--bare"
      {...field('name')}
    />
  )

  const noteField = (label: string, placeholder: string) => (
    <label className="gp-contact-note gp-bare-field">
      <span>{label}</span>
      <textarea
        aria-label={label}
        placeholder={placeholder}
        rows={2}
        className="gp-input--bare"
        {...field('note')}
      />
    </label>
  )

  /** Every live route as a row of buttons — the shared bottom rail. */
  const routeRail = () => {
    const routes = reachRoutes(fields)
    if (routes.length === 0) return null
    return (
      <nav className="gp-contact-routes" aria-label="Ways to reach">
        {routes.map((route) => {
          const Icon = ROUTE_ICONS[route.kind]
          return (
            <a
              key={route.kind}
              href={route.href}
              target={route.kind === 'site' ? '_blank' : undefined}
              rel={route.kind === 'site' ? 'noreferrer' : undefined}
              data-preferred={route.preferred || undefined}
              data-kind={route.kind}
            >
              <Icon size={11} aria-hidden />
              <span>{route.label}</span>
            </a>
          )
        })}
      </nav>
    )
  }

  let body: ReactNode

  if (skin === 'business') {
    const site = siteHref(fields.website)
    const cell = (
      label: string,
      key: Parameters<typeof field>[0],
      placeholder: string,
      channel?: ContactChannel,
    ) => (
      <div>
        <dt>
          {label}
          {channel && fields.preferred === channel && (
            <i className="gp-contact-dot" title="Preferred channel" aria-label="Preferred channel" />
          )}
        </dt>
        <dd className="gp-bare-field">
          <input
            aria-label={label}
            placeholder={placeholder}
            className="gp-input--bare"
            {...field(key)}
          />
        </dd>
      </div>
    )
    body = (
      <div className="gp-contact-business">
        <header>
          <span className="gp-contact-monogram" aria-hidden>{initials}</span>
          <div className="gp-contact-identity gp-bare-field">
            {nameField}
            <input
              aria-label="Job title"
              placeholder="Job title"
              className="gp-contact-role gp-input--bare"
              {...field('role')}
            />
          </div>
        </header>
        <span className="gp-contact-rule" aria-hidden />
        <dl className="gp-contact-grid">
          {cell('Company', 'organization', 'Where they work')}
          {cell('Email', 'email', 'name@company', 'email')}
          {cell('Direct', 'phone', 'Work number', 'phone')}
          {cell('Web', 'website', 'company.com')}
        </dl>
        {site && (
          <a className="gp-contact-link" href={site} target="_blank" rel="noreferrer">
            <ExternalLink size={10} aria-hidden />
            {siteLabel(fields.website)}
          </a>
        )}
      </div>
    )
  } else if (skin === 'emergency') {
    const tel = telHref(fields.phone)
    body = (
      <div className="gp-contact-emergency">
        <header className="gp-contact-alarm">
          <Siren size={11} aria-hidden />
          <span>Emergency contact</span>
        </header>
        <div className="gp-contact-identity gp-bare-field">
          {nameField}
          <input
            aria-label="Relation"
            placeholder="Relation — sister, neighbour, GP"
            className="gp-contact-role gp-input--bare"
            {...field('role')}
          />
        </div>
        {tel ? (
          <a className="gp-contact-call" href={tel}>
            <Phone size={16} aria-hidden />
            <strong>{fields.phone.trim()}</strong>
            <small>Tap to call</small>
          </a>
        ) : (
          <p className="gp-contact-call" data-empty>
            <Phone size={16} aria-hidden />
            <strong>No number yet</strong>
            <small>Add one below to make this card dial</small>
          </p>
        )}
        <div className="gp-contact-emergency-rows">
          {line('phone', 'Number', <Phone size={11} />, '+44 …', 'tel')}
          {line('email', 'Email', <AtSign size={11} />, 'name@example.com', 'email')}
        </div>
        <label className="gp-contact-critical gp-bare-field">
          <span><TriangleAlert size={10} aria-hidden /> Critical info</span>
          <textarea
            aria-label="Critical info"
            placeholder="Allergies, medication, door code, blood group"
            rows={2}
            className="gp-input--bare"
            {...field('note')}
          />
        </label>
      </div>
    )
  } else if (skin === 'vendor') {
    body = (
      <div className="gp-contact-vendor">
        <header>
          <input
            aria-label="Company"
            placeholder="Company"
            className="gp-contact-name gp-input--bare"
            {...field('organization')}
          />
          <span className="gp-contact-chip">
            <Tag size={10} aria-hidden />
            <input
              aria-label="Service category"
              placeholder="Service"
              className="gp-input--bare"
              {...field('role')}
            />
          </span>
        </header>
        {/* A plot, not a map: the dot grid and the pin say "this is where they
            are" without shipping tiles the board would have to fetch. */}
        <div className="gp-contact-plot">
          <span className="gp-contact-pin" aria-hidden>
            <MapPin size={13} />
          </span>
          <label className="gp-bare-field">
            <textarea
              aria-label="Address"
              placeholder="Address or service area"
              rows={3}
              className="gp-input--bare"
              {...field('address')}
            />
          </label>
        </div>
        <div className="gp-contact-meta">
          <label className="gp-contact-line gp-bare-field">
            <span className="gp-contact-line-icon" aria-hidden><Hash size={11} /></span>
            <span className="gp-contact-line-label">Account</span>
            <input
              aria-label="Account or reference number"
              placeholder="Reference"
              className="gp-contact-ref gp-input--bare"
              {...field('reference')}
            />
          </label>
          {line('note', 'Terms', <StickyNote size={11} />, 'Net 30 · £75 call-out')}
        </div>
        {routeRail()}
      </div>
    )
  } else if (skin === 'relationship') {
    const state = relationshipState(skinStateFor(data, 'relationship'))
    const reading = cadenceReading(state, now)
    const today = dayKey(now)
    const loggedToday = state.lastContact === today
    const setCadence = (days: number) => writeState('relationship', {
      ...state,
      cadenceDays: Math.min(CADENCE_LIMIT, Math.max(1, days)),
    })
    body = (
      <div className="gp-contact-relationship" data-status={reading.status}>
        <header>
          <span className="gp-contact-avatar" data-size="small" aria-hidden>{initials}</span>
          <div className="gp-contact-identity gp-bare-field">
            {nameField}
            <input
              aria-label="How you know them"
              placeholder="How you know them"
              className="gp-contact-role gp-input--bare"
              {...field('role')}
            />
          </div>
        </header>
        <div className="gp-contact-cadence">
          <div className="gp-contact-cadence-head">
            <strong>{cadenceLabel(reading)}</strong>
            <small>{cadenceDueLabel(reading)}</small>
          </div>
          <span
            className="gp-contact-track"
            style={{ '--gp-contact-progress': reading.progress } as CSSProperties}
            role="img"
            aria-label={cadenceDueLabel(reading)}
          >
            <i aria-hidden />
          </span>
          <div className="gp-contact-cadence-foot">
            <span className="gp-contact-stepper">
              <button
                type="button"
                aria-label="Contact less often"
                onClick={() => setCadence(state.cadenceDays - 1)}
              >
                <Minus size={10} aria-hidden />
              </button>
              <b>every {state.cadenceDays}d</b>
              <button
                type="button"
                aria-label="Contact more often"
                onClick={() => setCadence(state.cadenceDays + 1)}
              >
                <Plus size={10} aria-hidden />
              </button>
            </span>
            <button
              type="button"
              className="gp-contact-log gp-contact-fill"
              data-done={loggedToday || undefined}
              onClick={() => writeState('relationship', { ...state, lastContact: today })}
            >
              {loggedToday ? <Check size={11} aria-hidden /> : <HeartPulse size={11} aria-hidden />}
              {loggedToday ? 'Logged today' : 'Log contact'}
            </button>
          </div>
        </div>
        {noteField('Context', 'What is going on with them right now')}
      </div>
    )
  } else if (skin === 'household') {
    const state = householdState(skinStateFor(data, 'household'))
    const put = (members: typeof state.members) => writeState('household', { members })
    body = (
      <div className="gp-contact-household">
        <header className="gp-contact-plate">
          <span className="gp-contact-door" aria-hidden><House size={14} /></span>
          <div className="gp-contact-identity gp-bare-field">
            <input
              aria-label="Household"
              placeholder="Household"
              className="gp-contact-name gp-input--bare"
              {...field('name')}
            />
            <input
              aria-label="Address"
              placeholder="Address"
              className="gp-contact-role gp-input--bare"
              {...field('address')}
            />
          </div>
        </header>
        <div className="gp-contact-roster" data-floor-overflow="scroll">
          {state.members.length === 0 && (
            <p className="gp-contact-empty">Nobody added yet — everyone under this roof goes here.</p>
          )}
          {state.members.map((member) => (
            <WidgetPanel
              key={member.id}
              removing={removingIds.has(member.id)}
              onExitComplete={() => {
                setRemovingIds((previous) => {
                  if (!previous.has(member.id)) return previous
                  const next = new Set(previous)
                  next.delete(member.id)
                  return next
                })
                put(withoutPanelItem(state.members, member.id))
              }}
              floor="controls"
              grip={false}
              className="gp-contact-person"
            >
              <span className="gp-contact-pip" aria-hidden>{initialsOf(member.name)}</span>
              <input
                aria-label="Name"
                placeholder="Name"
                className="gp-input--bare"
                value={member.name}
                onChange={(event) => put(state.members.map((entry) => (
                  entry.id === member.id ? { ...entry, name: event.target.value } : entry
                )))}
              />
              <input
                aria-label="Relation"
                placeholder="Relation"
                className="gp-contact-relation gp-input--bare"
                value={member.relation}
                onChange={(event) => put(state.members.map((entry) => (
                  entry.id === member.id ? { ...entry, relation: event.target.value } : entry
                )))}
              />
              <button
                type="button"
                className="gp-contact-remove"
                aria-label={`Remove ${member.name.trim() || 'this person'}`}
                onClick={() => setRemovingIds((previous) => new Set(previous).add(member.id))}
              >
                <X size={10} aria-hidden />
              </button>
            </WidgetPanel>
          ))}
        </div>
        {state.members.length < HOUSEHOLD_LIMIT && (
          <button
            type="button"
            className="gp-contact-add gp-contact-fill"
            onClick={() => put([
              ...state.members,
              { id: crypto.randomUUID(), name: '', relation: '' },
            ])}
          >
            <UserPlus size={11} aria-hidden />
            Add person
          </button>
        )}
        <footer className="gp-contact-shared">
          <label className="gp-bare-field">
            <Phone size={10} aria-hidden />
            <input
              aria-label="Shared phone"
              placeholder="Shared line"
              className="gp-input--bare"
              {...field('phone')}
            />
          </label>
          <label className="gp-bare-field">
            <AtSign size={10} aria-hidden />
            <input
              aria-label="Shared email"
              placeholder="Shared email"
              className="gp-input--bare"
              {...field('email')}
            />
          </label>
        </footer>
      </div>
    )
  } else if (skin === 'care_contact') {
    const state = careState(skinStateFor(data, 'care_contact'))
    const setOrder = (order: number) => writeState('care_contact', {
      ...state,
      escalation: Math.min(CARE_ESCALATION_LIMIT, Math.max(1, order)),
    })
    const tel = telHref(fields.phone)
    const mail = mailHref(fields.email)
    body = (
      <div className="gp-contact-care">
        <header>
          <div className="gp-contact-escalation" data-first={state.escalation === 1 || undefined}>
            <b className="gp-contact-tabular">{state.escalation}</b>
            <span className="gp-contact-order" role="group" aria-label="Escalation order">
              <button
                type="button"
                aria-label="Earlier in the call order"
                disabled={state.escalation === 1}
                onClick={() => setOrder(state.escalation - 1)}
              >
                <ChevronUp size={11} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Later in the call order"
                disabled={state.escalation === CARE_ESCALATION_LIMIT}
                onClick={() => setOrder(state.escalation + 1)}
              >
                <ChevronDown size={11} aria-hidden />
              </button>
            </span>
          </div>
          <div className="gp-contact-identity gp-bare-field">
            {nameField}
            <input
              aria-label="Care role"
              placeholder="Care role — district nurse, GP, neighbour"
              className="gp-contact-role gp-input--bare"
              {...field('role')}
            />
            <input
              aria-label="Practice or agency"
              placeholder="Practice or agency"
              className="gp-contact-org gp-input--bare"
              {...field('organization')}
            />
          </div>
        </header>
        <p className="gp-contact-escalation-label">
          <Stethoscope size={10} aria-hidden />
          {escalationLabel(state.escalation)}
        </p>
        <label className="gp-contact-line gp-bare-field">
          <span className="gp-contact-line-icon" aria-hidden><Clock size={11} /></span>
          <span className="gp-contact-line-label">Available</span>
          <input
            aria-label="Availability"
            placeholder="Weekdays 9–5"
            className="gp-input--bare"
            value={state.availability}
            onChange={(event) => writeState('care_contact', {
              ...state,
              availability: event.target.value,
            })}
          />
        </label>
        {noteField('Care notes', 'What this person handles, and what to say')}
        <div className="gp-contact-care-actions">
          {tel ? (
            <a href={tel} data-primary><Phone size={12} aria-hidden />Call</a>
          ) : (
            <label className="gp-bare-field">
              <Phone size={11} aria-hidden />
              <input
                aria-label="Phone"
                placeholder="Add a number"
                className="gp-input--bare"
                {...field('phone')}
              />
            </label>
          )}
          {mail && <a href={mail}><AtSign size={12} aria-hidden />Email</a>}
        </div>
      </div>
    )
  } else {
    const birthday = birthdayReading(fields.birthday, now)
    body = (
      <div className="gp-contact-personal">
        <header>
          <span className="gp-contact-avatar" aria-hidden>{initials}</span>
          <div className="gp-contact-identity gp-bare-field">
            {nameField}
            <input
              aria-label="Relation or nickname"
              placeholder="Friend, cousin, "
              className="gp-contact-role gp-input--bare"
              {...field('role')}
            />
          </div>
        </header>
        {birthday && (
          <p className="gp-contact-birthday" data-today={birthday.today || undefined}>
            <Cake size={11} aria-hidden />
            <span>{birthday.label}</span>
            <small>
              {birthday.today
                ? birthday.turning === null ? 'Birthday today' : `Turns ${birthday.turning} today`
                : `${birthday.turning === null ? 'Birthday' : `Turns ${birthday.turning}`} in ${birthday.daysUntil} ${birthday.daysUntil === 1 ? 'day' : 'days'}`}
            </small>
          </p>
        )}
        <div className="gp-contact-form" data-floor-overflow="scroll">
          {line('phone', 'Phone', <Phone size={11} />, '+44 …', 'tel')}
          {line('email', 'Email', <AtSign size={11} />, 'name@example.com', 'email')}
          {line('birthday', 'Birthday', <Cake size={11} />, '', 'date')}
          {line('note', 'Note', <StickyNote size={11} />, 'How you met, what they like')}
        </div>
        <div className="gp-contact-channels" role="group" aria-label="Preferred channel">
          <span>Reach by</span>
          {CHANNELS.map((channel) => (
            <button
              key={channel.value}
              type="button"
              className="gp-contact-fill"
              data-active={fields.preferred === channel.value || undefined}
              aria-pressed={fields.preferred === channel.value}
              onClick={() => write({
                // Pressing the active chip clears it: no preference is a
                // legitimate answer, and it is the state the card starts in.
                preferred: fields.preferred === channel.value ? undefined : channel.value,
              })}
            >
              {channel.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="gp-contact-skin"
      data-contact-skin={skin}
      aria-label={`${displayName(fields.name)} — contact card`}
    >
      {body}
    </div>
  )
}
