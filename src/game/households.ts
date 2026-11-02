import { type ModelId } from './config';
import { carePreferenceScale, modelEffects, type CareLevel } from './economy';

export interface HouseholdProfile {
  id: number;
  introduction: string;
  feelsAtHomeWith: string;
  findsDifficult: string;
  firstRemark: string;
  warning: string;
  modelBias: Record<ModelId, number>;
  remarks: Record<ModelId, string>;
  // Snatches from the workshop are used sparingly, not as explanations.
  workbenchLine: string;
}

/*
  People respond to the same street differently. A helpful addition may
  soothe one household while making another restless. The player is shown
  their ordinary tastes, not a diagnosis or a taxonomy of personality.
  Values are per road tile visited in an item's Manhattan-radius footprint.
*/
export const HOUSEHOLD_PROFILES: readonly HouseholdProfile[] = [
  {
    id: 0,
    introduction: 'The Finches like to see where a road might lead.',
    feelsAtHomeWith: 'Open views, old trees and a little room to wander.',
    findsDifficult: 'A sign or watchful building at every turn.',
    firstRemark: 'There is always another way around.',
    warning: 'It does not feel like our road anymore.',
    modelBias: { lamp: -0.16, tree: -0.55, bench: -0.25, limit: 0.94, police: 1.18, bin: -0.12 },
    remarks: {
      lamp: 'Good to see the road ahead.',
      tree: 'The trees make the journey feel wider.',
      bench: 'Somewhere to stop, if we choose.',
      limit: 'Another sign telling us how to drive.',
      police: 'You can scarcely take a turn unnoticed.',
      bin: 'A small bin makes it easier to roam without a mess.'
    },
    workbenchLine: '“I could try that corner,” the boy said. His father held the ruler a little longer.'
  },
  {
    id: 1,
    introduction: 'The Bells find things to admire in the smallest places.',
    feelsAtHomeWith: 'Unusual little details, green corners and places to pause.',
    findsDifficult: 'Too much sameness or a street full of instructions.',
    firstRemark: 'Look at the way the light falls on that little roof.',
    warning: 'Everything is starting to look rather alike.',
    modelBias: { lamp: -0.08, tree: -0.72, bench: -0.34, limit: 0.72, police: 0.94, bin: -0.26 },
    remarks: {
      lamp: 'The evening looks a little different here.',
      tree: 'You notice a new shape every time.',
      bench: 'That is a lovely place to sit.',
      limit: 'There is another sign where a view might be.',
      police: 'The corner has lost some of its charm.',
      bin: 'The corner looks much more cared for.'
    },
    workbenchLine: '“It needn’t match the picture,” the boy said. His father looked again at the box.'
  },
  {
    id: 2,
    introduction: 'The Millers like a town that gets things done.',
    feelsAtHomeWith: 'Useful services, clear streets and a sense of purpose.',
    findsDifficult: 'Improvements that look fine but never seem to lead anywhere.',
    firstRemark: 'A working town is a good town.',
    warning: 'We used to get so much more done in a day.',
    modelBias: { lamp: -0.12, tree: 0.78, bench: 0.76, limit: 0.45, police: -0.30, bin: 0.14 },
    remarks: {
      lamp: 'A useful light when the day runs late.',
      tree: 'It is getting rather crowded with trees.',
      bench: 'More places to sit than places to work.',
      limit: 'We could be on our way by now.',
      police: 'A dependable place is worth the expense.',
      bin: 'At least there is somewhere for the packaging.'
    },
    workbenchLine: '“One more house,” his father said. The boy was still painting the first.'
  },
  {
    id: 3,
    introduction: 'The Marshes always seem to know who lives nearby.',
    feelsAtHomeWith: 'Shared spaces, familiar faces and somewhere to talk.',
    findsDifficult: 'Empty houses and streets people only hurry through.',
    firstRemark: 'It is good to see everyone out and about.',
    warning: 'We hardly see anyone on this road now.',
    modelBias: { lamp: -0.09, tree: -0.22, bench: -0.98, limit: 0.32, police: 0.65, bin: -0.38 },
    remarks: {
      lamp: 'It is nicer walking home past that light.',
      tree: 'A pleasant place to meet a neighbour.',
      bench: 'Someone will always have a story for that bench.',
      limit: 'At least there is time to wave as we pass.',
      police: 'The street seems a little less welcoming.',
      bin: 'It is easier to meet when the street is tidy.'
    },
    workbenchLine: 'The boy moved two houses closer together. His father left them there.'
  },
  {
    id: 4,
    introduction: 'The Hales remember how the town looked before each new addition.',
    feelsAtHomeWith: 'Familiar corners, quiet traditions and things made to last.',
    findsDifficult: 'Rapid changes that leave no room for what was here before.',
    firstRemark: 'There is still something fine about the old street.',
    warning: 'I can scarcely recognise the way home.',
    modelBias: { lamp: -0.40, tree: -0.45, bench: -0.42, limit: 0.61, police: 0.90, bin: -0.20 },
    remarks: {
      lamp: 'A proper lamp, just like the one before.',
      tree: 'That tree will be here longer than any of us.',
      bench: 'It is worth keeping somewhere familiar.',
      limit: 'We managed well enough without all these signs.',
      police: 'Another change to a road that was fine.',
      bin: 'One of those sensible old cast-iron bins.'
    },
    workbenchLine: '“Grandad made that one,” his father said, brushing dust from an old model.'
  },
  {
    id: 5,
    introduction: 'The Wards always check that the neighbours got home safely.',
    feelsAtHomeWith: 'Well-lit corners, calm journeys and a reassuring presence.',
    findsDifficult: 'Dark bends, uncertainty and avoidable risks.',
    firstRemark: 'It is easier to rest when everyone is home.',
    warning: 'One of these days somebody will get hurt.',
    modelBias: { lamp: -0.70, tree: 0.26, bench: 0.07, limit: -0.75, police: -0.95, bin: -0.32 },
    remarks: {
      lamp: 'Much better. We can see around that bend.',
      tree: 'Lovely, though it blocks the view a little.',
      bench: 'A good place to wait for someone.',
      limit: 'A little patience keeps everyone safe.',
      police: 'It helps to know someone is looking out.',
      bin: 'A tidy road is a safer-feeling road.'
    },
    workbenchLine: '“The wheel might come loose,” his father said, though the boy had fitted it well.'
  }
];

export function householdProfile(id: number): HouseholdProfile {
  const profile = HOUSEHOLD_PROFILES[id];
  if (!profile || profile.id !== id) throw new Error('Unknown household: ' + id);
  return profile;
}

export function modelReactionPerTile(householdId: number, modelId: ModelId, care: CareLevel = 'full'): number {
  const effects = modelEffects(modelId, care);
  return effects.comfort + householdProfile(householdId).modelBias[modelId] * carePreferenceScale(care);
}

export function moodName(irritation: number, occupied: boolean): string {
  if (!occupied) return 'Moved away';
  if (irritation >= 90) return 'Packing up';
  if (irritation >= 72) return 'On edge';
  if (irritation >= 45) return 'Unsettled';
  return 'At ease';
}

export function moodClass(irritation: number, occupied: boolean): string {
  if (!occupied) return 'away';
  if (irritation >= 72) return 'danger';
  if (irritation >= 45) return 'uneasy';
  return 'calm';
}
