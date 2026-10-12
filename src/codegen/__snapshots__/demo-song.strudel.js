// @song name="Demo"
setcpm(112/4)
// key: C Minor
// @end song

// @track id=t1 name="Drums"
const drums_A = s("bd*4, [~ sd]*2, [~ hh]*4").bank("RolandTR909")  // Groove · 1 bar
const drums_B = s("bd ~ bd ~ bd bd bd ~, [~ sd]*2, hh*16, ~ ~ ~ ~ ~ ~ ~ oh").bank("RolandTR909")  // Busy hats · 1 bar
const drums_C = s("bd bd ~ ~, ~ ~ ~ ~ ~ ~ ~ ~ sd sd sd sd ~ ~ ~ ~, cr, ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ lt lt, ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ mt ~ ~, ~ ~ ~ ht").bank("RolandTR909")  // Fill · 1 bar
drums: drums_A.room(.15)
// @end t1

// @track id=t2 name="Bass"
const bass_A = note("c2@2 ~ c2 ~ ~ g1@2 ~ ~ bb1 ~ c2@2 ~ ~").s("gm_synth_bass_1")  // Root · 1 bar
const bass_B = note("<[c2@2 ~ eb2 ~ ~ g2@2 ~ ~ bb1 ~ c2@2 ~ ~] [ab1@2 ~ ab1 ~ ~ c2@2 ~ ~ eb2 ~ g1@4]>").s("gm_synth_bass_1")  // Walk · 2 bars
bass: bass_A.lpf(900).gain(.9)
// @end t2

// @track id=t3 name="Keys"
const keys_A = note("<[[c3,eb3,g3]@16] [[ab2,c3,eb3]@16]>").s("piano")  // Cm · Ab · 2 bars
const keys_B = note("<[[c3,eb3,g3]@16] [[c3,f3,ab3]@16] [[ab2,c3,eb3]@16] [[b2,d3,g3]@16]>").s("piano")  // Cm Fm Ab G · 4 bars
keys: keys_A.room(.4).gain(.7)
// @end t3

// @track id=t4 name="Lead"
const lead_A = note("<[g4 ~ bb4 ~ c5@2 ~ ~ eb5 ~ d5 ~ c5@3 ~] [bb4 ~ g4@2 ~ ~ f4 ~ g4@6 ~ ~]>").s("sawtooth")  // Motif · 2 bars
lead: silence
// @end t4
