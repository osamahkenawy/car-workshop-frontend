import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Xmark, User, Car, Wrench, ClipboardCheck, Plus, Trash, Search,
  Calendar, Timer, NavArrowLeft, NavArrowRight, Check,
} from 'iconoir-react';
import api from '../lib/api';
import { CAR_CATALOG, CAR_MAKES } from '../lib/carCatalog';

/**
 * NewWorkOrderModal — car-workshop "job card" creation flow.
 *
 * Replaces the old delivery wizard (sender/recipient/packages/stops).
 * Steps: Customer & Vehicle → Complaint & Services → Estimate items & charges
 *        → Assign technician/bay & review.  Posts to POST /work-orders and,
 * if a technician is chosen, POST /work-orders/:id/assign.
 */

const WORK_ORDER_TYPES = [
  { value: 'standard',  label: 'Standard' },
  { value: 'express',   label: 'Express' },
  { value: 'same_day',  label: 'Same day' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'warranty',  label: 'Warranty' },
];

const SERVICE_CATEGORIES = [
  { value: 'general_maintenance', label: 'General maintenance' },
  { value: 'oil_change',          label: 'Oil change' },
  { value: 'brake_repair',        label: 'Brake repair' },
  { value: 'diagnostic',          label: 'Diagnostic' },
  { value: 'bodywork',            label: 'Bodywork' },
  { value: 'tire_service',        label: 'Tire service' },
  { value: 'engine_repair',       label: 'Engine repair' },
  { value: 'transmission',        label: 'Transmission' },
  { value: 'electrical',          label: 'Electrical' },
  { value: 'other',               label: 'Other' },
];

const PAYMENT_METHODS = [
  { value: 'cash',    label: 'Cash' },
  { value: 'prepaid', label: 'Prepaid' },
  { value: 'credit',  label: 'Credit' },
  { value: 'wallet',  label: 'Wallet' },
];

const FUEL_TYPES = ['petrol', 'diesel', 'hybrid', 'electric', 'lpg'];

const STEPS = [
  { n: 1, title: 'Customer & Vehicle', icon: User },
  { n: 2, title: 'Complaint & Service', icon: Wrench },
  { n: 3, title: 'Estimate & Charges', icon: ClipboardCheck },
  { n: 4, title: 'Assign & Review', icon: Check },
];

const ORANGE = '#f97316';
const NAVY = '#1e3a6b';

const EMPTY_VEHICLE = { make: '', model: '', year: '', plate_number: '', vin: '', color: '', mileage: '', fuel_type: 'petrol', transmission: 'automatic' };
const EMPTY_ITEM = { name: '', quantity: 1, unit_price: '', notes: '' };

export default function NewWorkOrderModal({ open, presetCustomerId = null, onClose, onCreated, currency = 'AED' }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // reference data
  const [customers, setCustomers] = useState([]);
  const [serviceBays, setServiceBays] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);

  // step 1 — customer & vehicle
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [walkIn, setWalkIn] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ ...EMPTY_VEHICLE });

  // step 2 — complaint & service
  const [workOrderType, setWorkOrderType] = useState('standard');
  const [serviceCategory, setServiceCategory] = useState('general_maintenance');
  const [description, setDescription] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  // step 3 — estimate items & charges
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [serviceFee, setServiceFee] = useState('');
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // step 4 — assignment
  const [serviceBayId, setServiceBayId] = useState('');
  const [mechanicId, setMechanicId] = useState('');

  const resetAll = useCallback(() => {
    setStep(1); setSubmitting(false); setError('');
    setCustomerId(''); setCustomerSearch(''); setWalkIn(false);
    setCustomerName(''); setCustomerPhone(''); setCustomerEmail('');
    setVehicleId(''); setAddingVehicle(false); setNewVehicle({ ...EMPTY_VEHICLE });
    setWorkOrderType('standard'); setServiceCategory('general_maintenance');
    setDescription(''); setSpecialInstructions(''); setScheduledAt('');
    setItems([{ ...EMPTY_ITEM }]); setServiceFee(''); setDiscount(''); setPaymentMethod('cash');
    setServiceBayId(''); setMechanicId('');
  }, []);

  // Load reference data when the modal opens
  useEffect(() => {
    if (!open) return;
    resetAll();
    (async () => {
      try {
        const [cRes, bRes, mRes] = await Promise.all([
          api.get('/customers?limit=500'),
          api.get('/service-bays'),
          api.get('/mechanics?limit=500'),
        ]);
        if (cRes.success) setCustomers(cRes.data || []);
        if (bRes.success) setServiceBays(bRes.data || []);
        if (mRes.success) setMechanics(mRes.data || []);
        if (presetCustomerId) setCustomerId(String(presetCustomerId));
      } catch (e) { console.error(e); }
    })();
  }, [open, presetCustomerId, resetAll]);

  // Load vehicles whenever a real customer is selected
  useEffect(() => {
    if (!customerId) { setVehicles([]); setVehicleId(''); return; }
    let cancelled = false;
    setVehiclesLoading(true);
    api.get(`/vehicles?customer_id=${customerId}&limit=100`)
      .then(res => { if (!cancelled && res.success) setVehicles(res.data || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setVehiclesLoading(false); });
    return () => { cancelled = true; };
  }, [customerId]);

  const selectedCustomer = useMemo(
    () => customers.find(c => String(c.id) === String(customerId)) || null,
    [customers, customerId]
  );

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers.filter(c =>
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [customers, customerSearch]);

  const totals = useMemo(() => {
    const itemsTotal = items.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);
    const fee = parseFloat(serviceFee) || 0;
    const disc = parseFloat(discount) || 0;
    const grand = Math.max(0, itemsTotal + fee - disc);
    return { itemsTotal, fee, disc, grand };
  }, [items, serviceFee, discount]);

  const fmt = (n) => `${currency} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /* ── item helpers ── */
  const updateItem = (idx, field, value) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  /* ── validation ── */
  const validateStep = (s) => {
    if (s === 1) {
      if (walkIn) {
        if (!customerName.trim()) return 'Enter the customer name.';
        if (!customerPhone.trim()) return 'Enter the customer phone.';
      } else {
        if (!customerId) return 'Select a customer, or switch to a walk-in.';
      }
      if (addingVehicle) {
        if (!newVehicle.make.trim() || !newVehicle.model.trim()) return 'Vehicle make and model are required.';
      }
    }
    if (s === 2) {
      if (!description.trim()) return 'Describe the customer complaint or the work requested.';
    }
    if (s === 3) {
      const bad = items.some(it => it.name.trim() && (parseFloat(it.unit_price) < 0 || parseFloat(it.quantity) < 0));
      if (bad) return 'Item quantity and price cannot be negative.';
    }
    return '';
  };

  const next = () => {
    const msg = validateStep(step);
    if (msg) { setError(msg); return; }
    setError('');
    setStep(s => Math.min(s + 1, STEPS.length));
  };
  const back = () => { setError(''); setStep(s => Math.max(s - 1, 1)); };

  /* ── submit ── */
  const submit = async () => {
    for (let s = 1; s <= 3; s++) { const m = validateStep(s); if (m) { setError(m); setStep(s); return; } }
    setSubmitting(true); setError('');
    try {
      let vId = vehicleId || null;

      // Create a new vehicle first if the user is adding one (needs a real customer)
      if (!walkIn && addingVehicle && customerId) {
        const vRes = await api.post('/vehicles', { customer_id: Number(customerId), ...newVehicle,
          year: newVehicle.year || null, mileage: newVehicle.mileage || null });
        if (!vRes.success) { setError(vRes.message || 'Could not save the vehicle.'); setSubmitting(false); return; }
        vId = vRes.data?.id || null;
      }

      const payload = {
        customer_id: walkIn ? null : (customerId ? Number(customerId) : null),
        vehicle_id: vId,
        service_bay_id: serviceBayId ? Number(serviceBayId) : null,
        work_order_type: workOrderType,
        service_category: serviceCategory,
        customer_name: walkIn ? customerName.trim() : (selectedCustomer?.full_name || ''),
        customer_phone: walkIn ? customerPhone.trim() : (selectedCustomer?.phone || ''),
        customer_email: walkIn ? customerEmail.trim() : (selectedCustomer?.email || ''),
        description: description.trim(),
        special_instructions: specialInstructions.trim() || null,
        scheduled_at: scheduledAt || null,
        payment_method: paymentMethod,
        // Backend total_amount = cash_amount + service_fee - discount (line items are
        // stored but not summed server-side), so send the parts/services subtotal as
        // cash_amount to make the estimate total come out correct.
        cash_amount: totals.itemsTotal,
        service_fee: parseFloat(serviceFee) || 0,
        discount: parseFloat(discount) || 0,
        items: items
          .filter(it => it.name.trim())
          .map(it => ({ name: it.name.trim(), quantity: parseFloat(it.quantity) || 1, unit_price: parseFloat(it.unit_price) || 0, notes: it.notes.trim() || null })),
      };

      const res = await api.post('/work-orders', payload);
      if (!res.success) {
        if (res.upgrade_required) setError(res.message || 'Work order limit reached — upgrade your plan.');
        else setError(res.message || 'Could not create the work order.');
        setSubmitting(false);
        return;
      }

      const created = res.data;
      // Assign a technician if one was chosen
      if (mechanicId && created?.id) {
        try { await api.patch(`/work-orders/${created.id}/assign-mechanic`, { mechanic_id: Number(mechanicId) }); } catch { /* non-fatal */ }
      }

      setSubmitting(false);
      onCreated?.(created);
    } catch (e) {
      console.error(e);
      setError('Network error — please try again.');
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={st.header}>
          <div>
            <h2 style={st.title}>New Job Card</h2>
            <p style={st.subtitle}>Step {step} of {STEPS.length} — {STEPS[step - 1].title}</p>
          </div>
          <button style={st.closeBtn} onClick={onClose} aria-label="Close"><Xmark width={20} height={20} /></button>
        </div>

        {/* Stepper */}
        <div style={st.stepper}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = step === s.n;
            const done = step > s.n;
            return (
              <div key={s.n} style={st.stepWrap}>
                <div style={{ ...st.stepBubble, ...(active ? st.stepActive : done ? st.stepDone : {}) }}>
                  {done ? <Check width={16} height={16} /> : <Icon width={16} height={16} />}
                </div>
                <span style={{ ...st.stepLabel, color: active ? NAVY : '#94a3b8', fontWeight: active ? 700 : 500 }}>{s.title}</span>
                {i < STEPS.length - 1 && <div style={{ ...st.stepLine, background: done ? ORANGE : '#e2e8f0' }} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div style={st.body}>
          {error && <div style={st.error}>{error}</div>}

          {step === 1 && (
            <div style={st.grid2}>
              {/* Customer */}
              <div>
                <div style={st.sectionLabel}>Customer</div>
                <div style={st.toggleRow}>
                  <button style={{ ...st.toggle, ...(!walkIn ? st.toggleOn : {}) }} onClick={() => setWalkIn(false)}>
                    <User width={16} height={16} /> Existing customer
                  </button>
                  <button style={{ ...st.toggle, ...(walkIn ? st.toggleOn : {}) }} onClick={() => { setWalkIn(true); setCustomerId(''); }}>
                    <Plus width={16} height={16} /> Walk-in
                  </button>
                </div>

                {!walkIn ? (
                  <>
                    <div style={st.searchWrap}>
                      <Search width={16} height={16} style={{ color: '#94a3b8' }} />
                      <input style={st.searchInput} placeholder="Search name, phone or email…" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                    </div>
                    <div style={st.custList}>
                      {filteredCustomers.length === 0 && <div style={st.emptyHint}>No customers match.</div>}
                      {filteredCustomers.map(c => (
                        <button key={c.id} style={{ ...st.custItem, ...(String(c.id) === String(customerId) ? st.custItemOn : {}) }} onClick={() => setCustomerId(String(c.id))}>
                          <div style={st.custName}>{c.full_name}</div>
                          <div style={st.custMeta}>{c.phone}{c.email ? ` · ${c.email}` : ''}</div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={st.fieldStack}>
                    <Field label="Customer name *"><input style={st.input} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name" /></Field>
                    <Field label="Phone *"><input style={st.input} value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+971 50 000 0000" /></Field>
                    <Field label="Email"><input style={st.input} value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="name@example.com" /></Field>
                  </div>
                )}
              </div>

              {/* Vehicle */}
              <div>
                <div style={st.sectionLabel}>Vehicle</div>
                {walkIn ? (
                  <div style={st.emptyHint}>Walk-in job — vehicle details are optional and can be added later from the job card.</div>
                ) : !customerId ? (
                  <div style={st.emptyHint}>Select a customer to see their vehicles.</div>
                ) : addingVehicle ? (
                  <div style={st.fieldStack}>
                    <div style={st.grid2Tight}>
                      <Field label="Make *">
                        <select style={st.input} value={newVehicle.make}
                          onChange={e => setNewVehicle(v => ({ ...v, make: e.target.value, model: '' }))}>
                          <option value="">Select make…</option>
                          {CAR_MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </Field>
                      <Field label="Model *">
                        {newVehicle.make && CAR_CATALOG[newVehicle.make] && CAR_CATALOG[newVehicle.make].length > 0 ? (
                          <select style={st.input} value={newVehicle.model}
                            onChange={e => setNewVehicle(v => ({ ...v, model: e.target.value }))}>
                            <option value="">Select model…</option>
                            {CAR_CATALOG[newVehicle.make].map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        ) : (
                          <input style={st.input} value={newVehicle.model}
                            onChange={e => setNewVehicle(v => ({ ...v, model: e.target.value }))}
                            placeholder={newVehicle.make ? 'Enter model' : 'Select make first'}
                            disabled={!newVehicle.make} />
                        )}
                      </Field>
                    </div>
                    <div style={st.grid2Tight}>
                      <Field label="Year"><input style={st.input} value={newVehicle.year} onChange={e => setNewVehicle(v => ({ ...v, year: e.target.value }))} placeholder="2021" /></Field>
                      <Field label="Plate #"><input style={st.input} value={newVehicle.plate_number} onChange={e => setNewVehicle(v => ({ ...v, plate_number: e.target.value }))} placeholder="A 12345" /></Field>
                    </div>
                    <div style={st.grid2Tight}>
                      <Field label="Odometer (km)"><input style={st.input} value={newVehicle.mileage} onChange={e => setNewVehicle(v => ({ ...v, mileage: e.target.value }))} placeholder="45000" /></Field>
                      <Field label="Fuel">
                        <select style={st.input} value={newVehicle.fuel_type} onChange={e => setNewVehicle(v => ({ ...v, fuel_type: e.target.value }))}>
                          {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </Field>
                    </div>
                    <button style={st.linkBtn} onClick={() => setAddingVehicle(false)}>← Choose an existing vehicle</button>
                  </div>
                ) : (
                  <>
                    {vehiclesLoading && <div style={st.emptyHint}>Loading vehicles…</div>}
                    {!vehiclesLoading && vehicles.length === 0 && <div style={st.emptyHint}>No vehicles on file for this customer.</div>}
                    <div style={st.custList}>
                      {vehicles.map(v => (
                        <button key={v.id} style={{ ...st.custItem, ...(String(v.id) === String(vehicleId) ? st.custItemOn : {}) }} onClick={() => setVehicleId(String(v.id))}>
                          <div style={st.custName}><Car width={14} height={14} style={{ verticalAlign: -2, marginRight: 6 }} />{v.make} {v.model}{v.year ? ` (${v.year})` : ''}</div>
                          <div style={st.custMeta}>{v.plate_number || 'No plate'}{v.color ? ` · ${v.color}` : ''}</div>
                        </button>
                      ))}
                    </div>
                    <button style={st.addVehicleBtn} onClick={() => { setVehicleId(''); setAddingVehicle(true); }}>
                      <Plus width={16} height={16} /> Add a new vehicle
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={st.fieldStack}>
              <div style={st.grid2Tight}>
                <Field label="Job type">
                  <select style={st.input} value={workOrderType} onChange={e => setWorkOrderType(e.target.value)}>
                    {WORK_ORDER_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Service category">
                  <select style={st.input} value={serviceCategory} onChange={e => setServiceCategory(e.target.value)}>
                    {SERVICE_CATEGORIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Customer complaint / work requested *">
                <textarea style={{ ...st.input, minHeight: 90, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Car pulls to the left when braking; grinding noise from the front wheels." />
              </Field>
              <Field label="Notes for the technician">
                <textarea style={{ ...st.input, minHeight: 64, resize: 'vertical' }} value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)}
                  placeholder="Internal notes, parts to check, warranty details…" />
              </Field>
              <Field label="Scheduled drop-off / appointment">
                <input type="datetime-local" style={st.input} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={st.sectionLabel}>Estimate line items (services & parts)</div>
              <div style={st.itemsHead}>
                <span style={{ flex: 1 }}>Description</span>
                <span style={{ width: 64, textAlign: 'center' }}>Qty</span>
                <span style={{ width: 110, textAlign: 'right' }}>Unit price</span>
                <span style={{ width: 110, textAlign: 'right' }}>Amount</span>
                <span style={{ width: 32 }} />
              </div>
              {items.map((it, idx) => (
                <div key={idx} style={st.itemRow}>
                  <input style={{ ...st.input, flex: 1 }} placeholder="Oil change · brake pads · labor…" value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)} />
                  <input style={{ ...st.input, width: 64, textAlign: 'center' }} value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                  <input style={{ ...st.input, width: 110, textAlign: 'right' }} placeholder="0.00" value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} />
                  <div style={st.itemAmount}>{fmt((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0))}</div>
                  <button style={st.itemDel} onClick={() => removeItem(idx)} aria-label="Remove item"><Trash width={15} height={15} /></button>
                </div>
              ))}
              <button style={st.linkBtn} onClick={addItem}><Plus width={15} height={15} /> Add line item</button>

              <div style={st.chargeGrid}>
                <Field label="Extra labor / service fee"><input style={st.input} placeholder="0.00" value={serviceFee} onChange={e => setServiceFee(e.target.value)} /></Field>
                <Field label="Discount"><input style={st.input} placeholder="0.00" value={discount} onChange={e => setDiscount(e.target.value)} /></Field>
                <Field label="Payment method">
                  <select style={st.input} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                    {PAYMENT_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              </div>

              <div style={st.totalsBox}>
                <Row label="Parts & services" value={fmt(totals.itemsTotal)} />
                <Row label="Labor / service fee" value={fmt(totals.fee)} />
                <Row label="Discount" value={`- ${fmt(totals.disc)}`} />
                <div style={st.totalDivider} />
                <Row label="Estimate total" value={fmt(totals.grand)} strong />
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={st.fieldStack}>
              <div style={st.grid2Tight}>
                <Field label="Service bay">
                  <select style={st.input} value={serviceBayId} onChange={e => setServiceBayId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {serviceBays.map(b => <option key={b.id} value={b.id}>{b.name || b.bay_name || `Bay ${b.id}`}</option>)}
                  </select>
                </Field>
                <Field label="Assign technician">
                  <select style={st.input} value={mechanicId} onChange={e => setMechanicId(e.target.value)}>
                    <option value="">Assign later</option>
                    {mechanics.map(m => <option key={m.id} value={m.id}>{m.full_name}{m.status ? ` · ${m.status}` : ''}</option>)}
                  </select>
                </Field>
              </div>

              <div style={st.reviewCard}>
                <ReviewRow icon={User} label="Customer"
                  value={walkIn ? `${customerName || '—'} · ${customerPhone || ''} (walk-in)` : (selectedCustomer ? `${selectedCustomer.full_name} · ${selectedCustomer.phone || ''}` : '—')} />
                <ReviewRow icon={Car} label="Vehicle"
                  value={addingVehicle ? `${newVehicle.make} ${newVehicle.model} ${newVehicle.year || ''} (new)`.trim()
                    : (vehicles.find(v => String(v.id) === String(vehicleId)) ? `${vehicles.find(v => String(v.id) === String(vehicleId)).make} ${vehicles.find(v => String(v.id) === String(vehicleId)).model}` : '—')} />
                <ReviewRow icon={Wrench} label="Service"
                  value={`${SERVICE_CATEGORIES.find(s => s.value === serviceCategory)?.label} · ${WORK_ORDER_TYPES.find(w => w.value === workOrderType)?.label}`} />
                <ReviewRow icon={Timer} label="Complaint" value={description || '—'} />
                {scheduledAt && <ReviewRow icon={Calendar} label="Scheduled" value={new Date(scheduledAt).toLocaleString()} />}
                <ReviewRow icon={ClipboardCheck} label="Estimate total" value={fmt(totals.grand)} strong />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={st.footer}>
          {step > 1
            ? <button style={st.ghostBtn} onClick={back}><NavArrowLeft width={16} height={16} /> Back</button>
            : <button style={st.ghostBtn} onClick={onClose}>Cancel</button>}
          {step < STEPS.length
            ? <button style={st.primaryBtn} onClick={next}>Next <NavArrowRight width={16} height={16} /></button>
            : <button style={{ ...st.primaryBtn, opacity: submitting ? 0.7 : 1 }} disabled={submitting} onClick={submit}>{submitting ? 'Creating…' : 'Create job card'}</button>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={st.field}>
      <span style={st.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}
function Row({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13.5, fontWeight: strong ? 800 : 500, color: strong ? NAVY : '#475569' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
function ReviewRow({ icon: Icon, label, value, strong }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <Icon width={18} height={18} style={{ color: ORANGE, flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 14, color: strong ? NAVY : '#1e293b', fontWeight: strong ? 800 : 500 }}>{value}</div>
      </div>
    </div>
  );
}

const st = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16, backdropFilter: 'blur(2px)' },
  modal: { background: '#fff', borderRadius: 20, width: '100%', maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 70px rgba(0,0,0,0.28)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '22px 26px 16px' },
  title: { margin: 0, fontSize: 21, fontWeight: 800, color: NAVY, letterSpacing: '-0.3px' },
  subtitle: { margin: '4px 0 0', fontSize: 13, color: '#64748b' },
  closeBtn: { background: '#f1f5f9', border: 'none', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' },
  stepper: { display: 'flex', alignItems: 'center', padding: '0 26px 18px', gap: 0 },
  stepWrap: { display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 },
  stepBubble: { width: 34, height: 34, borderRadius: '50%', background: '#f1f5f9', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid transparent', transition: 'all .2s' },
  stepActive: { background: '#fff7ed', color: ORANGE, borderColor: ORANGE },
  stepDone: { background: ORANGE, color: '#fff' },
  stepLabel: { fontSize: 12.5, marginLeft: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  stepLine: { flex: 1, height: 2, margin: '0 10px', borderRadius: 2, minWidth: 12 },
  body: { padding: '4px 26px 8px', overflowY: 'auto', flex: 1 },
  error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, fontWeight: 500 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 },
  grid2Tight: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  sectionLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: NAVY, fontWeight: 800, marginBottom: 10 },
  toggleRow: { display: 'flex', gap: 8, marginBottom: 12 },
  toggle: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  toggleOn: { borderColor: ORANGE, background: '#fff7ed', color: ORANGE },
  searchWrap: { display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '0 12px', marginBottom: 10 },
  searchInput: { border: 'none', outline: 'none', padding: '10px 0', fontSize: 14, width: '100%', background: 'transparent' },
  custList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 230, overflowY: 'auto' },
  custItem: { textAlign: 'left', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', background: '#fff', cursor: 'pointer' },
  custItemOn: { borderColor: ORANGE, background: '#fff7ed' },
  custName: { fontSize: 14, fontWeight: 700, color: '#1e293b' },
  custMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  emptyHint: { fontSize: 13, color: '#94a3b8', padding: '12px 0', lineHeight: 1.5 },
  addVehicleBtn: { marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, border: '1.5px dashed #cbd5e1', background: '#f8fafc', color: NAVY, borderRadius: 10, padding: '9px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, width: '100%', justifyContent: 'center' },
  fieldStack: { display: 'flex', flexDirection: 'column', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  fieldLabel: { fontSize: 12, fontWeight: 700, color: '#475569' },
  input: { border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', color: '#1e293b', background: '#fff', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
  linkBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: ORANGE, cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: '8px 0', marginTop: 4 },
  itemsHead: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 2px 6px' },
  itemRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  itemAmount: { width: 110, textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: '#1e293b' },
  itemDel: { width: 32, height: 32, borderRadius: 8, border: 'none', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chargeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 18 },
  totalsBox: { marginTop: 18, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, padding: '12px 16px' },
  totalDivider: { height: 1, background: '#e2e8f0', margin: '6px 0' },
  reviewCard: { border: '1px solid #eef2f7', borderRadius: 12, padding: '4px 16px', background: '#fff' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 26px', borderTop: '1px solid #f1f5f9', gap: 12 },
  ghostBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${ORANGE},#ea580c)`, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 14px rgba(249,115,22,0.3)' },
};
