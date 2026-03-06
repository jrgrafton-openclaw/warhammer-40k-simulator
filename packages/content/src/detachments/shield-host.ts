/**
 * Shield Host — Adeptus Custodes Detachment (10th Edition)
 *
 * The Shield Host represents a bespoke retinue of elite Custodians,
 * fighting as a cohesive brotherhood under a single Shield-Captain.
 *
 * Detachment Rule: "Shoulder the Mantle"
 * Each time a unit from your army is selected to fight, until the end
 * of the phase, you can re-roll one hit roll and you can re-roll one
 * wound roll made for that unit.
 *
 * NOTE (v0.7): The detachment rule is defined in schema form here but the
 * engine-side implementation is STUBBED. The schema validates correctly;
 * the actual re-roll mechanic will be implemented in a future phase.
 */
import type { Detachment } from '../schemas.js';

export const SHIELD_HOST: Detachment = {
  id: 'shield-host',
  name: 'Shield Host',
  faction: 'ADEPTUS_CUSTODES',
  rule: {
    name: 'Shoulder the Mantle',
    description:
      'Each time a unit from your army is selected to fight, until the end ' +
      'of the phase, you can re-roll one hit roll and you can re-roll one ' +
      'wound roll made for that unit. ' +
      '[STUBBED in v0.7 — schema defined, engine mechanic pending]',
  },
  enhancements: [
    {
      name: 'Veiled Blade',
      description:
        'The bearer\'s melee weapons gain the [LETHAL HITS] keyword. ' +
        '[STUBBED in v0.7]',
      points: 15,
    },
    {
      name: 'Auramite and Flesh',
      description:
        'Once per battle, when the bearer would be destroyed, roll one D6: ' +
        'on a 2+, that model is not destroyed and its wounds characteristic is set to D3. ' +
        '[STUBBED in v0.7]',
      points: 25,
    },
    {
      name: 'Inspirational Fighter',
      description:
        'Add 1 to the Attacks characteristic of melee weapons equipped by friendly ' +
        'ADEPTUS CUSTODES units while they are within 6" of the bearer. ' +
        '[STUBBED in v0.7]',
      points: 30,
    },
  ],
  stratagemIds: [
    'armour-of-contempt',
    'only-in-death',
    'tanglefoot-grenade',
    'peerless-warriors',
    'the-emperors-shield',
    'through-unity-devastation',
  ],
};
