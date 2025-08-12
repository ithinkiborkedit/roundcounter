import React, { useEffect, useMemo, useState } from "react";

// ========================= Festival Round Calculator — Clean Regen (JS, single file) =========================
// Includes per your "Yes":
// - ErrorBoundary + heartbeat (visible clock) so the preview always initializes and shows errors
// - Admin-only drink list; members choose/default from that list with ✅ feedback
// - Auto-join (including buyer) when starting a normal round, for members with default+opt-in
// - Split Round picker to start a round with a hand-picked subset (overrides auto-join)
// - Buyer-only Reopen/Delete for drafts in History
// - Per-person late-join add; prices propagate; subtotals/totals

// -------------------- Error boundary --------------------
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError:false, err:null, info:null }; }
  static getDerivedStateFromError(err){ return { hasError:true, err }; }
  componentDidCatch(err, info){ this.setState({ info }); }
  render(){
    if(this.state.hasError){
      return (
        <div className="p-4 bg-red-50 text-red-800 rounded-xl">
          <div className="font-semibold mb-1">Render error</div>
          <pre className="whitespace-pre-wrap text-xs">{String(this.state.err)}{this.state.info?"\n"+this.state.info.componentStack:""}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// -------------------- Helpers --------------------
const rand = (n) => Math.floor(Math.random() * n);
const newId = () => Math.random().toString(36).slice(2,10);
const EMOJIS = ["🍺","🍻","🍷","🥂","🍸","🍹","🍾","🧃","🥤","🧋","☕","🧉","✨","🎉","🎈","🎶","🪩","🌙","⭐"];
const now = () => Date.now();
const shortCode = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c = ""; for(let i=0;i<4;i++) c += a[rand(a.length)]; return c; };
const resolveDefaultDrink = (drinks, member) => member?.defaultDrinkId ? (drinks.find(d=>d.id===member.defaultDrinkId) || null) : null;
const computeRoundSubtotal = (items) => (items||[]).reduce((s,it)=> s + (Number(it.unitPrice)||0) * (Number(it.qty)||0), 0);

// -------------------- App --------------------
function AppInner(){
  // Heartbeat
  const [heartbeat, setHeartbeat] = useState(() => new Date().toLocaleTimeString());
  useEffect(()=>{ const id=setInterval(()=> setHeartbeat(new Date().toLocaleTimeString()), 1000); return ()=> clearInterval(id); },[]);

  // Session + core state
  const [session, setSession] = useState({ code: shortCode(), status: "active", adminId: null, createdAt: now() });
  // Member: {id,name,emoji,isAdmin,defaultDrinkId,autoJoin}
  const [members, setMembers] = useState([]);
  // Drink: {id,name,price}
  const [drinks, setDrinks] = useState([]);
  // Round: {id,number,buyerId,items[],createdAt,confirmedAt}
  const [rounds, setRounds] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  // Split picker UI
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitSelected, setSplitSelected] = useState(new Set());

  // Derived
  const currentUser = useMemo(()=> members.find(m=>m.id===currentUserId) || null, [members, currentUserId]);
  const isAdmin = !!currentUser?.isAdmin;
  const nextRoundNumber = useMemo(()=> rounds.length ? Math.max(...rounds.map(r=>r.number)) + 1 : 1, [rounds]);

  // Members
  function addMember(name, isAdminFlag=false){
    if(!name.trim()) return;
    const m = { id:newId(), name:name.trim(), emoji:EMOJIS[rand(EMOJIS.length)], isAdmin:isAdminFlag, defaultDrinkId:null, autoJoin:true };
    setMembers(p=>[...p,m]);
    if(session.adminId===null && isAdminFlag) setSession(s=>({...s, adminId:m.id}));
    if(!currentUserId) setCurrentUserId(m.id);
  }
  const setMemberDefaultDrink = (memberId, drinkId) => setMembers(prev=> prev.map(m=> m.id===memberId ? { ...m, defaultDrinkId: drinkId || null } : m));
  const setMemberAutoJoin     = (memberId, value)    => setMembers(prev=> prev.map(m=> m.id===memberId ? { ...m, autoJoin: !!value } : m));

  // Drinks (admin only)
  function addDrink(name, price){ if(!isAdmin) return; if(!name.trim()) return; setDrinks(prev=>[...prev, { id:newId(), name:name.trim(), price: price? Number(price) : null }]); }

  // Rounds
  function startRound(buyerId){
    if(session.status!=="active") return;
    const r = { id:newId(), number:nextRoundNumber, buyerId, items:[], createdAt: now(), confirmedAt: null };
    // Auto-join everyone (including buyer) who opted in AND has a default
    const autoItems = members
      .filter(m=> m.autoJoin)
      .map(m=> ({ m, d: resolveDefaultDrink(drinks, m) }))
      .filter(({d})=> !!d)
      .map(({m,d})=> ({ id:newId(), recipientId:m.id, drinkId:d.id, drinkName:d.name, unitPrice: d.price ?? null, qty: 1 }));
    r.items = autoItems;
    setRounds(p=>[...p, r]);
    setEditingId(r.id);
  }

  function startSplitRound(buyerId, selectedIds){
    if(session.status!=="active") return;
    const r = { id:newId(), number:nextRoundNumber, buyerId, items:[], createdAt: now(), confirmedAt: null };
    const chosen = new Set(selectedIds);
    const items = members
      .filter(m=> chosen.has(m.id))
      .map(m=> ({ m, d: resolveDefaultDrink(drinks, m) }))
      .filter(({d})=> !!d)
      .map(({m,d})=> ({ id:newId(), recipientId:m.id, drinkId:d.id, drinkName:d.name, unitPrice: d.price ?? null, qty: 1 }));
    r.items = items;
    setRounds(p=>[...p, r]);
    setEditingId(r.id);
    setSplitOpen(false); setSplitSelected(new Set());
  }

  // Draft controls
  function cancelEditing(){
    if(!editingId) return;
    const r = rounds.find(x=>x.id===editingId);
    if(r && !r.confirmedAt && r.items.length===0){
      setRounds(prev=> prev.filter(x=> x.id!==r.id));
    }
    setEditingId(null);
  }
  const confirmRound = (roundId) => { setRounds(prev=> prev.map(r=> r.id===roundId ? { ...r, confirmedAt: now() } : r)); setEditingId(null); };
  const reopenDraft  = (roundId) => { const r = rounds.find(x=>x.id===roundId); if(!r || r.confirmedAt) return; setEditingId(roundId); };
  const deleteDraft  = (roundId) => { setRounds(prev=> prev.filter(r=> r.id!==roundId)); if(editingId===roundId) setEditingId(null); };

  // Editor helpers
  function addDefaultForRecipient(roundId, recipientId){
    const recip = members.find(m=>m.id===recipientId);
    const d = resolveDefaultDrink(drinks, recip);
    if(!d) return;
    setRounds(prev=> prev.map(r=> r.id===roundId ? { ...r, items:[...r.items, { id:newId(), recipientId: recip.id, drinkId: d.id, drinkName: d.name, unitPrice: d.price ?? null, qty: 1 }] } : r));
  }
  const changeItem = (roundId, itemId, updates) => setRounds(prev=> prev.map(r=> r.id===roundId ? { ...r, items: r.items.map(it=> it.id===itemId ? { ...it, ...updates } : it) } : r));
  const removeItem = (roundId, itemId)        => setRounds(prev=> prev.map(r=> r.id===roundId ? { ...r, items: r.items.filter(it=> it.id!==itemId) } : r));

  // Totals
  const roundSubtotal = (round) => computeRoundSubtotal(round.items);

  // Split helpers for child
  const toggleSplitSelect = (id) => setSplitSelected(prev=> { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const clearSplitSelect  = () => setSplitSelected(new Set());
  const selectAllSplit    = () => setSplitSelected(new Set(members.map(m=>m.id)));
  const openSplitPicker   = () => { const buyer = currentUserId ? members.find(m=>m.id===currentUserId) : null; const s = new Set(); if(buyer) s.add(buyer.id); setSplitSelected(s); setSplitOpen(true); };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">🎪 Festival Round Calculator — Clean Regen</h1>
            <p className="text-sm text-neutral-600">Session: <span className="font-mono">{session.code}</span> • Status: <span className="uppercase text-xs px-2 py-0.5 rounded bg-neutral-900 text-white">{session.status}</span></p>
          </div>
          <div className="text-xs text-neutral-500">env OK • {heartbeat}</div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Left: Members + Defaults */}
          <div className="md:col-span-1 space-y-4">
            <MembersCard
              members={members}
              currentUserId={currentUserId}
              onChangeUser={setCurrentUserId}
              onAdd={addMember}
              drinks={drinks}
              onSetDefault={setMemberDefaultDrink}
              onSetAutoJoin={setMemberAutoJoin}
            />
            {isAdmin && <DrinksCard drinks={drinks} onAdd={addDrink} />}
          </div>

          {/* Middle: Round editor */}
          <div className="md:col-span-1 space-y-4">
            <RoundsCard
              members={members}
              drinks={drinks}
              currentUserId={currentUserId}
              rounds={rounds}
              editingId={editingId}
              splitOpen={splitOpen}
              splitSelected={splitSelected}
              onOpenSplit={openSplitPicker}
              onToggleSplit={toggleSplitSelect}
              onClearSplit={clearSplitSelect}
              onSelectAllSplit={selectAllSplit}
              onStart={(buyerId)=> startRound(buyerId)}
              onStartSplit={(ids)=> startSplitRound(currentUserId, ids)}
              onCancel={cancelEditing}
              onConfirm={confirmRound}
              onAddPerRecipient={(rid)=> addDefaultForRecipient(editingId, rid)}
              onChangeItem={changeItem}
              onRemoveItem={removeItem}
              roundSubtotal={roundSubtotal}
            />
          </div>

          {/* Right: History + League */}
          <div className="md:col-span-1 space-y-4">
            <HistoryCard
              rounds={rounds}
              members={members}
              currentUserId={currentUserId}
              roundSubtotal={roundSubtotal}
              onReopenDraft={reopenDraft}
              onDeleteDraft={deleteDraft}
            />
            <LeagueCard standings={useStandingsMemo(members, rounds)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Standings hook
function useStandingsMemo(members, rounds){
  return useMemo(()=>{
    const bought=new Map(), received=new Map();
    members.forEach(m=>{ bought.set(m.id,0); received.set(m.id,0); });
    rounds.filter(r=>r.confirmedAt).forEach(r=>{ bought.set(r.buyerId,(bought.get(r.buyerId)||0)+1); r.items.forEach(it=> received.set(it.recipientId,(received.get(it.recipientId)||0)+(it.qty||0))); });
    const rows = members.map(m=>({ member:m, roundsBought:bought.get(m.id)||0, drinksReceived:received.get(m.id)||0, net:(bought.get(m.id)||0)-(received.get(m.id)||0) }));
    rows.sort((a,b)=>(a.roundsBought-b.roundsBought)||(b.drinksReceived-a.drinksReceived)||a.member.name.localeCompare(b.member.name));
    return rows;
  },[members, rounds]);
}

// -------------------- Components --------------------
function MembersCard({ members, currentUserId, onChangeUser, onAdd, drinks, onSetDefault, onSetAutoJoin }){
  const [name,setName] = useState("");
  const [isAdminFlag,setIsAdminFlag] = useState(false);
  const [justSaved,setJustSaved] = useState(false);

  const me = members.find(m=>m.id===currentUserId) || null;
  const myDefaultId = me?.defaultDrinkId || "";
  const myAutoJoin = !!me?.autoJoin;

  function handleSetDefault(drinkId){ onSetDefault(currentUserId, drinkId); setJustSaved(true); setTimeout(()=> setJustSaved(false), 900); }

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
      <h2 className="font-semibold">People</h2>
      <div className="flex gap-2">
        <input className="flex-1 border rounded-xl px-3 py-2" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isAdminFlag} onChange={e=>setIsAdminFlag(e.target.checked)} /> Admin</label>
        <button className="px-3 py-2 rounded-xl bg-neutral-900 text-white" onClick={()=>{ onAdd(name,isAdminFlag); setName(""); setIsAdminFlag(false); }}>Add</button>
      </div>

      <div>
        <label className="text-sm text-neutral-600">Acting as</label>
        <select className="w-full border rounded-xl px-3 py-2 mt-1" value={currentUserId || ""} onChange={(e)=> onChangeUser(e.target.value)}>
          <option value="" disabled>— pick member —</option>
          {members.map(m=> <option key={m.id} value={m.id}>{m.emoji} {m.name}{m.isAdmin?" (admin)":""}</option>)}
        </select>
      </div>

      {currentUserId && (
        <div className="border rounded-xl p-3 space-y-2">
          <div className="font-medium">Your settings</div>
          <div className="flex items-center gap-2">
            <select className="flex-1 border rounded-xl px-3 py-2" value={myDefaultId} onChange={(e)=> handleSetDefault(e.target.value)}>
              <option value="">— choose default from admin list —</option>
              {drinks.map(d=> <option key={d.id} value={d.id}>{d.name}{d.price!=null?` (€${Number(d.price).toFixed(2)})`:``}</option>)}
            </select>
            {myDefaultId && <span className="text-green-600">✅ Saved</span>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={myAutoJoin} onChange={(e)=> onSetAutoJoin(currentUserId, e.target.checked)} />
            Auto‑join rounds (add my default when a round starts)
          </label>
          {justSaved && <div className="text-xs text-green-600">Default updated.</div>}
        </div>
      )}

      <ul className="space-y-2 max-h-56 overflow-auto mt-2">
        {members.map(m=> (
          <li key={m.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
            <div className="flex items-center gap-2"><span className="text-xl">{m.emoji}</span><span className="font-medium">{m.name}</span>{m.isAdmin && <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded">admin</span>}</div>
            <div className="text-sm text-neutral-600 flex items-center gap-2">
              <span className={m.autoJoin?"text-green-600":"text-neutral-400"}>{m.autoJoin?"auto‑join":"opt‑out"}</span>
              <span>•</span>
              {(() => { const d = resolveDefaultDrink(drinks, m); return d? `${d.name}${d.price!=null?` • €${Number(d.price).toFixed(2)}`:``}` : <span className="text-neutral-400">no default</span>; })()}
            </div>
          </li>
        ))}
        {members.length===0 && <li className="text-neutral-500">Add people to begin.</li>}
      </ul>
    </div>
  );
}

function DrinksCard({ drinks, onAdd }){
  const [name,setName] = useState("");
  const [price,setPrice] = useState("");
  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-2">
      <h2 className="font-semibold">Drinks (admin)</h2>
      <div className="flex gap-2">
        <input className="flex-1 border rounded-xl px-3 py-2" placeholder="Drink name" value={name} onChange={e=>setName(e.target.value)} />
        <input className="w-28 border rounded-xl px-3 py-2" placeholder="Price (opt)" value={price} onChange={e=>setPrice(e.target.value)} />
        <button className="px-3 py-2 rounded-xl bg-neutral-900 text-white" onClick={()=>{ onAdd(name, price); setName(""); setPrice(""); }}>Add</button>
      </div>
      <ul className="list-disc list-inside text-sm">
        {drinks.map(d=> <li key={d.id}>{d.name} {d.price!=null?`(€${Number(d.price).toFixed(2)})`:``}</li>)}
        {drinks.length===0 && <li className="text-neutral-500">No drinks yet.</li>}
      </ul>
    </div>
  );
}

function RoundsCard({ members, drinks, currentUserId, rounds, editingId, splitOpen, splitSelected, onOpenSplit, onToggleSplit, onClearSplit, onSelectAllSplit, onStart, onStartSplit, onCancel, onConfirm, onAddPerRecipient, onChangeItem, onRemoveItem, roundSubtotal }){
  const buyer = members.find(m=>m.id===currentUserId) || null;
  const round = rounds.find(r=>r.id===editingId) || null;
  const canStart = !!buyer;

  const selectedCount = splitSelected.size;
  const allCount = members.length;

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h2 className="font-semibold mb-2">Rounds</h2>
      {!round ? (
        <div>
          <p className="text-sm text-neutral-600 mb-3">Start a round as the current user. Auto‑join adds anyone opted‑in with a default. Or start a split round with a chosen subset (overrides auto‑join).</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button className="px-4 py-2 rounded-xl bg-neutral-900 text-white" disabled={!canStart} onClick={()=> onStart(buyer.id)}>Start Round (Auto‑join)</button>
            <button className="px-4 py-2 rounded-xl border" disabled={!canStart} onClick={onOpenSplit}>Start Split Round</button>
          </div>

          {splitOpen && (
            <div className="border rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">Pick people to include</div>
                <div className="flex gap-2 text-xs">
                  <button className="px-2 py-1 border rounded" onClick={onSelectAllSplit}>Select all</button>
                  <button className="px-2 py-1 border rounded" onClick={onClearSplit}>Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-auto">
                {members.map(m=> (
                  <label key={m.id} className={`flex items-center justify-between border rounded-xl px-3 py-2 ${splitSelected.has(m.id)?'bg-neutral-50':''}`}>
                    <span>{m.emoji} {m.name}</span>
                    <input type="checkbox" checked={splitSelected.has(m.id)} onChange={()=> onToggleSplit(m.id)} />
                  </label>
                ))}
                {members.length===0 && <div className="text-neutral-500">No members yet.</div>}
              </div>
              <div className="flex items-center justify-between text-sm text-neutral-600">
                <span>{selectedCount} selected / {allCount} total</span>
                <button className="px-3 py-2 rounded-xl bg-neutral-900 text-white" disabled={selectedCount===0} onClick={()=> onStartSplit(Array.from(splitSelected))}>Start with selected</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm">Buyer: <span className="font-semibold">{buyer?.emoji} {buyer?.name}</span> • Round #{round.number}</div>
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold">Subtotal: €{roundSubtotal(round).toFixed(2)}</div>
              <button className="px-3 py-2 rounded-xl bg-neutral-200" onClick={onCancel}>Cancel</button>
              <button className="px-3 py-2 rounded-xl bg-neutral-900 text-white" onClick={()=> onConfirm(round.id)}>Confirm</button>
            </div>
          </div>

          {/* Quick per-person add for late joiners */}
          <div className="flex flex-wrap gap-2 mb-3">
            {members.filter(m=>m.id!==buyer?.id).map(m=> {
              const d = resolveDefaultDrink(drinks, m);
              return (
                <button key={m.id} className="px-3 py-2 rounded-xl border" disabled={!d} title={!d?"No default set":undefined} onClick={()=> onAddPerRecipient(m.id)}>
                  {m.emoji} {d?`+ ${d.name}`:"(no default)"}
                </button>
              );
            })}
          </div>

          <div className="border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50"><tr><th className="text-left p-2">Recipient</th><th className="text-left p-2">Drink</th><th className="text-left p-2">Qty</th><th className="text-left p-2">Unit</th><th className="text-left p-2">Line</th><th></th></tr></thead>
              <tbody>
                {round.items.map(it=>{
                  const recip = members.find(m=>m.id===it.recipientId);
                  const unit = it.unitPrice ?? 0; const line = unit * (it.qty||0);
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">{recip?recip.name:"?"}</td>
                      <td className="p-2">{it.drinkName}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <button className="px-2 py-1 border rounded" onClick={()=> onChangeItem(round.id, it.id, { qty: Math.max(1, (it.qty||1)-1) })}>−</button>
                          <span>{it.qty||1}</span>
                          <button className="px-2 py-1 border rounded" onClick={()=> onChangeItem(round.id, it.id, { qty: (it.qty||1)+1 })}>+</button>
                        </div>
                      </td>
                      <td className="p-2">{unit?`€${unit.toFixed(2)}`:"—"}</td>
                      <td className="p-2">€{line.toFixed(2)}</td>
                      <td className="p-2 text-right"><button className="px-2 py-1 text-red-600" onClick={()=> onRemoveItem(round.id, it.id)}>Remove</button></td>
                    </tr>
                  );
                })}
                {round.items.length===0 && <tr><td className="p-3 text-neutral-500" colSpan={6}>No items yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryCard({ rounds, members, currentUserId, roundSubtotal, onReopenDraft, onDeleteDraft }){
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h2 className="font-semibold mb-2">History</h2>
      <div className="space-y-2 max-h-72 overflow-auto">
        {rounds.length===0 && <div className="text-sm text-neutral-500">No rounds yet.</div>}
        {rounds.map(r=> {
          const isDraft = !r.confirmedAt;
          const isBuyer = r.buyerId === currentUserId;
          return (
            <div key={r.id} className="border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm">Round #{r.number} • Buyer: <b>{members.find(m=>m.id===r.buyerId)?.name}</b> {isDraft ? <span className="ml-2 text-xs bg-yellow-100 px-2 py-0.5 rounded">draft</span> : <span className="ml-2 text-xs bg-green-100 px-2 py-0.5 rounded">confirmed</span>}</div>
                {isDraft && (
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded bg-neutral-200" disabled={!isBuyer} title={!isBuyer?"Only the buyer can reopen":undefined} onClick={()=> isBuyer && onReopenDraft(r.id)}>Reopen</button>
                    <button className="px-2 py-1 rounded bg-red-500 text-white" disabled={!isBuyer} title={!isBuyer?"Only the buyer can delete":undefined} onClick={()=> isBuyer && onDeleteDraft(r.id)}>Delete</button>
                  </div>
                )}
              </div>
              <ul className="mt-2 text-sm list-disc list-inside">
                {r.items.map(it=> (
                  <li key={it.id}>{members.find(m=>m.id===it.recipientId)?.name} — {it.qty}× {it.drinkName} {it.unitPrice!=null?`@ €${Number(it.unitPrice).toFixed(2)}`:""}</li>
                ))}
                {r.items.length===0 && <li className="text-neutral-500">(no items)</li>}
              </ul>
              <div className="mt-2 text-sm font-semibold">Total: €{roundSubtotal(r).toFixed(2)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeagueCard({ standings }){
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h2 className="font-semibold mb-2">League (Rounds vs Drinks)</h2>
      <div className="border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50"><tr><th className="text-left p-2">Name</th><th className="text-left p-2">Rounds Bought</th><th className="text-left p-2">Drinks Received</th><th className="text-left p-2">Net</th></tr></thead>
          <tbody>
            {standings.map(s=> (
              <tr key={s.member.id} className="border-t"><td className="p-2">{s.member.emoji} {s.member.name}</td><td className="p-2">{s.roundsBought}</td><td className="p-2">{s.drinksReceived}</td><td className={`p-2 ${s.net<0?"text-red-600":s.net>0?"text-green-600":""}`}>{s.net}</td></tr>
            ))}
            {standings.length===0 && <tr><td className="p-3 text-neutral-500" colSpan={4}>No members yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App(){
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
