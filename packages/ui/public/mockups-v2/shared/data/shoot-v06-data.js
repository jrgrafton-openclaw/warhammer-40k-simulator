export const BOARD = { width: 720, height: 528, inchesWide: 60, inchesHigh: 44 };
export const PX_PER_INCH = BOARD.width / BOARD.inchesWide;

export const TERRAIN = [
  { id:'t1', kind:'ruin', x:144, y:60,  w:144, h:72,  rot:90 },
  { id:'t2', kind:'ruin', x:264, y:336, w:144, h:72,  rot:90 },
  { id:'t3', kind:'ruin', x:192, y:264, w:96,  h:72,  rot:0, flipX:true },
  { id:'t4', kind:'scatter', x:48,  y:264, w:48,  h:72,  rot:0 },
  { id:'t5', kind:'scatter', x:336, y:0,   w:48,  h:72,  rot:0 },
  { id:'t6', kind:'ruin', x:360, y:204, w:78,  h:60,  rot:-45, flipX:true },
  { id:'t7', kind:'scatter', x:305, y:149, w:42,  h:60,  rot:-45, flipX:true },
  { id:'t8', kind:'scatter', x:318, y:247, w:48,  h:72,  rot:-45, flipX:true },
  { id:'t9', kind:'ruin', x:576, y:468, w:144, h:72,  rot:-90 },
  { id:'t10',kind:'ruin', x:456, y:192, w:144, h:72,  rot:-90 },
  { id:'t11',kind:'ruin', x:528, y:264, w:96,  h:72,  rot:-180, flipX:true },
  { id:'t12',kind:'scatter', x:672, y:264, w:48,  h:72,  rot:-180 },
  { id:'t13',kind:'scatter', x:384, y:528, w:48,  h:72,  rot:-180 },
  { id:'t14',kind:'ruin', x:360, y:324, w:78,  h:60,  rot:-225, flipX:true },
  { id:'t15',kind:'scatter', x:415, y:379, w:42,  h:60,  rot:-225, flipX:true },
  { id:'t16',kind:'scatter', x:402, y:281, w:48,  h:72,  rot:-225, flipX:true }
];

export const OBJECTIVES = [
  { id: 'o1', x: 360, y: 72, state: 'neutral' },
  { id: 'o2', x: 120, y: 264, state: 'friendly' },
  { id: 'o3', x: 360, y: 264, state: 'neutral' },
  { id: 'o4', x: 600, y: 264, state: 'enemy' },
  { id: 'o5', x: 360, y: 456, state: 'neutral' }
];

export const UNIT_DEFS = {
  'assault-intercessors': {
    name:'Assault Intercessors', faction:'SPACE MARINES', factionSubtitle:'SPACE MARINES · ADEPTUS ASTARTES', factionColor:'#2266dd', side:'imp', icon:'infantry', stats:{ M:'6"', T:4, Sv:'3+', W:2, Ld:7, OC:2 },
    weapons:[
      { type:'RANGED', name:'Heavy Bolt Pistol', rng:18, a:2, s:4, ap:0, d:1, kw:['PISTOL'] },
      { type:'MELEE', name:'Astartes Chainsword', rng:0, a:4, s:4, ap:-1, d:1, kw:['MELEE'] }
    ], abilities:[{name:'AND THEY SHALL KNOW NO FEAR', timing:'PASSIVE', desc:'Each time a model in this unit takes a wound, roll D6. On 6, that wound is ignored.'},{name:'SHOCK ASSAULT', timing:'FIGHT PHASE', desc:'On a turn this unit makes a charge move, until end of turn its models get +1 Attack.'}]
  },
  'primaris-lieutenant': {
    name:'Primaris Lieutenant', faction:'SPACE MARINES · CHARACTER', factionSubtitle:'SPACE MARINES · CHARACTER', factionColor:'#c9a352', side:'imp', icon:'character', stats:{ M:'6"', T:4, Sv:'3+', W:5, Ld:6, OC:1 },
    weapons:[
      { type:'RANGED', name:'Master-crafted Auto Pistol', rng:18, a:2, s:4, ap:0, d:1, kw:['PISTOL'] },
      { type:'MELEE', name:'Paired Combat Blades', rng:0, a:6, s:4, ap:-1, d:1, kw:['MELEE'] }
    ], abilities:[{name:'TACTICAL PRECISION', timing:'PASSIVE', desc:'Each time a friendly model within 6" shoots, improve AP by 1 if target is within half range.'}]
  },
  'intercessor-squad-a': {
    name:'Intercessor Squad A', faction:'SPACE MARINES', factionSubtitle:'SPACE MARINES · INFANTRY', factionColor:'#2266dd', side:'imp', icon:'infantry', stats:{ M:'6"', T:4, Sv:'3+', W:2, Ld:7, OC:2 },
    weapons:[
      { type:'RANGED', name:'Bolt Rifle', rng:30, a:2, s:4, ap:-1, d:1, kw:['RAPID FIRE 1'] },
      { type:'RANGED', name:'Bolt Pistol', rng:12, a:1, s:4, ap:0, d:1, kw:['PISTOL'] }
    ], abilities:[{name:'AND THEY SHALL KNOW NO FEAR', timing:'PASSIVE', desc:'Each time a model in this unit takes a wound, roll D6. On 6, that wound is ignored.'}]
  },
  'hellblasters': {
    name:'Hellblasters', faction:'SPACE MARINES', factionSubtitle:'SPACE MARINES · INFANTRY', factionColor:'#2266dd', side:'imp', icon:'elite', stats:{ M:'6"', T:4, Sv:'3+', W:2, Ld:7, OC:2 },
    weapons:[
      { type:'RANGED', name:'Plasma Incinerator (std)', rng:30, a:2, s:7, ap:-3, d:2, kw:['RAPID FIRE 1'] },
      { type:'RANGED', name:'Plasma Incinerator (sup)', rng:30, a:2, s:8, ap:-3, d:3, kw:['RAPID FIRE 1','HAZARDOUS'] }
    ], abilities:[{name:'FOR THE CHAPTER!', timing:'SHOOTING PHASE', desc:'Each time this unit is selected to shoot, you can re-roll one Hit roll.'}]
  },
  'redemptor-dreadnought': {
    name:'Redemptor Dreadnought', faction:'SPACE MARINES · VEHICLE', factionSubtitle:'SPACE MARINES · VEHICLE', factionColor:'#5a8acc', side:'imp', icon:'vehicle', stats:{ M:'8"', T:10, Sv:'2+', W:12, Ld:6, OC:3 },
    weapons:[
      { type:'RANGED', name:'Macro Plasma Incinerator', rng:36, a:3, s:8, ap:-4, d:2, kw:['HEAVY','BLAST'] },
      { type:'MELEE', name:'Redemptor Fist', rng:0, a:5, s:12, ap:-3, d:3, kw:['MELEE'] }
    ], abilities:[{name:'DUTY ETERNAL', timing:'PASSIVE', desc:'Each time an attack is allocated to this model, subtract 1 from the Damage characteristic.'}]
  },
  'boss-nob': {
    name:'Boss Nob', faction:'ORKS · CHARACTER', factionSubtitle:'ORKS · CHARACTER', factionColor:'#cc4444', side:'ork', icon:'character', stats:{ M:'5"', T:5, Sv:'4+', W:5, Ld:7, OC:1 },
    weapons:[{ type:'RANGED', name:'Slugga', rng:12, a:2, s:4, ap:0, d:1, kw:['PISTOL'] }, { type:'MELEE', name:'Power Klaw', rng:0, a:4, s:8, ap:-3, d:2, kw:['MELEE'] }], abilities:[{name:"'ERE WE GO", timing:'PASSIVE', desc:'This unit can make a charge move after Advancing. Add 1 to charge rolls.'}]
  },
  'nobz-mob': {
    name:'Nobz Mob', faction:'ORKS · INFANTRY', factionSubtitle:'ORKS · INFANTRY', factionColor:'#cc4444', side:'ork', icon:'elite', stats:{ M:'5"', T:5, Sv:'4+', W:3, Ld:'7+', OC:2 },
    weapons:[{ type:'RANGED', name:'Slugga', rng:12, a:2, s:4, ap:0, d:1, kw:['PISTOL'] }, { type:'MELEE', name:'Power Klaw', rng:0, a:3, s:8, ap:-2, d:2, kw:['MELEE'] }], abilities:[{name:"'ERE WE GO", timing:'PASSIVE', desc:'This unit can make a charge move after Advancing. Add 1 to charge rolls.'}]
  },
  'mekboy': {
    name:'Mekboy', faction:'ORKS · CHARACTER', factionSubtitle:'ORKS · CHARACTER', factionColor:'#cc4444', side:'ork', icon:'elite', stats:{ M:'5"', T:4, Sv:'5+', W:4, Ld:7, OC:1 },
    weapons:[{ type:'RANGED', name:'Kustom Mega-blasta', rng:24, a:3, s:8, ap:-3, d:'D3', kw:['MELTA 2'] }, { type:'MELEE', name:'Choppa', rng:0, a:3, s:4, ap:-1, d:1, kw:['MELEE'] }], abilities:[{name:"MEK'S TOOLS", timing:'PASSIVE', desc:'At the start of your Command phase, select one friendly VEHICLE model within 3". That model regains 1 lost wound.'}]
  }
};

export function createScenarioUnits() {
  return [
    { id:'assault-intercessors', faction:'imp', shot:true, models:[{id:'ai1',x:165,y:233,r:8},{id:'ai2',x:182,y:228,r:8},{id:'ai3',x:199,y:233,r:8},{id:'ai4',x:173,y:249,r:8},{id:'ai5',x:190,y:249,r:8}] },
    { id:'primaris-lieutenant', faction:'imp', shot:true, models:[{id:'pl1',x:125,y:312,r:9}] },
    { id:'intercessor-squad-a', faction:'imp', shot:true, models:[{id:'isa1',x:222,y:200,r:8},{id:'isa2',x:239,y:195,r:8},{id:'isa3',x:256,y:200,r:8},{id:'isa4',x:230,y:216,r:8},{id:'isa5',x:248,y:216,r:8}] },
    { id:'hellblasters', faction:'imp', shot:false, models:[{id:'hb1',x:80,y:200,r:8},{id:'hb2',x:97,y:195,r:8},{id:'hb3',x:114,y:200,r:8},{id:'hb4',x:88,y:216,r:8},{id:'hb5',x:105,y:216,r:8}] },
    { id:'redemptor-dreadnought', faction:'imp', shot:true, models:[{id:'rd1',x:150,y:278,r:22,shape:'rect',w:43,h:25}] },
    { id:'boss-nob', faction:'ork', shot:true, models:[{id:'bn1',x:560,y:118,r:9}], carryWounds:0 },
    { id:'nobz-mob', faction:'ork', shot:false, models:[{id:'nm1',x:430,y:128,r:9},{id:'nm2',x:462,y:136,r:9},{id:'nm3',x:446,y:166,r:9}], carryWounds:1 },
    { id:'mekboy', faction:'ork', shot:false, models:[{id:'mb1',x:338,y:258,r:8}], carryWounds:0 }
  ];
}
