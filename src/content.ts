// The bank is imported only by the Worker. Never serve this module as a static asset.
export const EXAM_VERSION = 'C–01 / v1.0';
export const PASS_MARK = 12;
export type Topic = { id: string; title: string; text: string; sources: { title: string; url: string }[] };
const sep = (slug: string, title: string) => ({ title: `Stanford Encyclopedia: ${title}`, url: `https://plato.stanford.edu/entries/${slug}/` });
export const topics: Topic[] = [
  { id: 'kinds', title: 'What kind of consciousness are we discussing?', text: 'Phenomenal consciousness is the felt character of experience: what seeing red or being in pain is like. Access consciousness concerns information being available for reasoning, reporting, and guiding action. Wakefulness, self-recognition, and intelligence are further distinctions. A demonstration of one is not automatically a demonstration of the others. The distinction does not itself prove that access and experience can come apart; that is a further claim.', sources: [sep('consciousness', 'Consciousness')] },
  { id: 'hard-problem', title: 'What makes the hard problem hard?', text: 'Explaining discrimination, attention, memory, and report explains capacities. The hard problem asks why or how physical processes are accompanied by experience at all. “Easy” problems may be scientifically formidable; the label marks a proposed difference in explanatory target. Some regard an extra explanation as necessary, others dispute that demand. Naming an explanatory gap does not by itself establish a nonphysical substance.', sources: [{ title: 'David Chalmers: Facing Up to the Problem of Consciousness', url: 'https://consc.net/papers/facing.html' }] },
  { id: 'qualia', title: 'What are qualia, and what does illusionism deny?', text: '“Qualia” can mean experiential qualities broadly, or qualities understood as intrinsic, private, and ineffable. Specify the sense. Illusionists challenge the picture of phenomenal properties presented by introspection and seek to explain why we judge that we have them. They need not deny sensory processing, pain behavior, or introspective reports. Critics ask whether explaining those judgments explains away experience. Neither calling qualia obvious nor calling them illusory settles the dispute.', sources: [sep('qualia', 'Qualia')] },
  { id: 'physicalism', title: 'Does physicalism imply that software can feel?', text: 'Physicalism says, roughly, that reality is fundamentally physical. It does not specify which physical arrangements suffice for experience. A physicalist might identify experiences with particular biological processes, or accept implementation in other materials. Computational sufficiency is the additional claim that the right implemented computation is enough for the relevant mental properties. Rejecting that claim need not mean rejecting physicalism.', sources: [sep('physicalism', 'Physicalism'), sep('mind-identity', 'The Mind/Brain Identity Theory')] },
  { id: 'functionalism', title: 'Is functionalism just a test of outward behavior?', text: 'Functionalism characterizes mental states by their causal roles: relations to inputs, other internal states, and outputs. A fixed transcript can match someone’s past words without reproducing that organization or the responses it would make in different circumstances. Critics can question whether even the right organization suffices for felt experience. Reconstructing the functionalist claim does not commit you to accepting it.', sources: [sep('functionalism', 'Functionalism')] },
  { id: 'substrate', title: 'What would multiple realizability show?', text: 'Multiple realizability is the possibility that one mental kind has physically different realizations. This challenges simple identifications of every instance of a mental kind with one narrowly specified physical kind. It does not say that any material arranged any way will do, or that current software is conscious. A substrate objection needs an account of which material properties matter and why; an implementation argument needs an account of what is preserved.', sources: [sep('multiple-realizability', 'Multiple Realizability')] },
  { id: 'mary', title: 'What is Mary supposed to learn?', text: 'Imagine Mary knows all physical facts about color vision while confined to a colorless environment. On seeing red, does she learn a new fact? The knowledge argument uses a yes answer to challenge physicalism’s completeness. Replies include gaining abilities such as recognition and imagination, acquiring acquaintance, or knowing an old fact under a new concept. Her learning something in an ordinary sense does not alone settle which reply succeeds.', sources: [sep('qualia-knowledge', 'The Knowledge Argument')] },
  { id: 'zombies', title: 'What is a philosophical zombie?', text: 'A philosophical zombie is stipulated to be a complete physical duplicate of a conscious person without experience. It is not a person who merely acts strangely. If such duplicates are metaphysically possible, the physical facts would not fix all experiential facts. The dispute includes whether the scenario is coherently conceivable and whether the relevant conceivability entails possibility. Imagining an empty-eyed robot establishes neither premise.', sources: [sep('zombies', 'Zombies')] },
  { id: 'chinese-room', title: 'What does the Chinese Room challenge?', text: 'A person manipulates Chinese symbols by rules without understanding Chinese. Searle uses this to challenge the sufficiency of formal symbol manipulation for understanding. The systems reply locates understanding in the organized whole rather than the rule-following component. Searle contests that reply. The argument is not simply that no machine can think: brains are physical machines too. Understanding and phenomenal experience are related but distinct targets.', sources: [sep('chinese-room', 'The Chinese Room Argument')] },
  { id: 'other-minds', title: 'How much does “I am conscious” tell us?', text: 'Other minds are not available to us in the same first-person way as our own experiences. Behavior, reports, shared biology, and explanatory theories can provide evidence. A report’s weight depends on how it was produced: a phrase selected to match a script is not automatically as informative as a human pain report. Uncertainty is not proof of absence. Neither fluent assertion nor inability to speak gives an infallible verdict.', sources: [sep('other-minds', 'Other Minds')] },
  { id: 'neural', title: 'Is a neural correlate an explanation?', text: 'A neural correlate tracks an aspect of consciousness under specified conditions. It may help locate relevant mechanisms, but a measured association alone does not distinguish the experience’s basis from its prerequisites or consequences, such as preparing a report. Interventions and controls can strengthen causal conclusions. Even then, identifying what produces or supports an experience is not automatically an account of why that process constitutes experience.', sources: [sep('consciousness-neuroscience', 'The Neuroscience of Consciousness')] },
  { id: 'theories', title: 'What do workspace and higher-order theories propose?', text: 'Workspace approaches emphasize information being broadcast for use across multiple cognitive systems. Higher-order approaches connect a state’s consciousness to a suitable representation of that state; versions differ over what representation is required and whether it must actually occur. Neither is simply a test of eloquence. Their explanatory targets and predictions require care, and recognizing their proposals does not require declaring either the winner.', sources: [sep('consciousness-higher', 'Higher-Order Theories'), sep('consciousness-neuroscience', 'The Neuroscience of Consciousness')] },
  { id: 'panpsychism', title: 'Does panpsychism make every object a person?', text: 'Panpsychism treats mentality or experience as fundamental and widespread, often at the level of basic constituents. It need not attribute human thought to stones or a single unified mind to every collection. The combination problem asks how simpler experiential subjects or properties could yield a unified complex experience. Declaring experience fundamental changes the explanatory task; it does not automatically solve that task.', sources: [sep('panpsychism', 'Panpsychism')] },
  { id: 'dualism', title: 'What does dualism distinguish?', text: 'Substance dualism posits minds and bodies as distinct kinds of substance. Property dualism posits irreducible mental properties, without necessarily positing a separate mental substance. These are not just the claim that mind-talk and brain-talk use different words. Interactionist views must explain how the mental affects the physical. A gap in present knowledge is a motivation for some arguments, not itself a demonstration of either kind of dualism.', sources: [sep('dualism', 'Dualism')] },
  { id: 'causation', title: 'Why is mental causation a problem?', text: 'We ordinarily say pain causes withdrawal. If physical effects already have sufficient physical causes, how does a distinct mental cause fit in? Views differ over identity, realization, interaction, and whether this is genuine causal competition. Epiphenomenalism makes mental events effects of physical events without causal influence on the physical. It is not the view that experiences do not occur; critics ask how our reports of experience can then be explained.', sources: [sep('epiphenomenalism', 'Epiphenomenalism'), sep('mind-identity', 'The Mind/Brain Identity Theory')] },
  { id: 'simulation', title: 'When is a simulation a realization?', text: 'A weather simulation does not make the computer wet. But a calculation performed on a computer can be a real calculation. Which analogy applies to consciousness depends on what properties are sufficient for it. Merely calling a system a simulation, or merely noting that it computes, leaves that question open. Ask what causal organization or physical properties the account requires.', sources: [sep('chinese-room', 'The Chinese Room Argument'), sep('functionalism', 'Functionalism')] },
];

export type BankQuestion = { id: string; topic: string; prompt: string; answers: string[]; explanation: string };
// First answer is the key in this private authoring format. Runtime assigns opaque IDs and shuffles.
const q = (id: string, topic: string, prompt: string, answers: string[], explanation: string): BankQuestion => ({ id, topic, prompt, answers, explanation });
export const bank: BankQuestion[] = [
  q('kinds-1', 'kinds', 'A system makes information available for reasoning and flexible action. Which claim does this most directly support?', [
    'It has access to the information in the relevant functional sense.', 'It has the felt quality normally associated with that information.', 'It can recognize itself as the subject of that information.', 'It has settled whether access and experience are identical.',
  ], 'Availability for reasoning and action concerns access. Felt character and self-recognition need further argument.'),
  q('kinds-2', 'kinds', 'Two researchers agree on every reported capacity but disagree about whether there is anything it feels like. Their disagreement is most directly about:', [
    'Phenomenal consciousness.', 'Behavioral performance.', 'Availability for report.', 'Task-solving intelligence.',
  ], 'The question of what it feels like targets phenomenal consciousness, even when observable capacities are agreed.'),
  q('hard-1', 'hard-problem', 'A theory explains attention and verbal reporting. What would a proponent of the hard problem still ask?', [
    'Why those processes are accompanied by experience.', 'How those processes produce verbal reports.', 'Which stimuli those processes select for attention.', 'How accurately those processes discriminate colors.',
  ], 'The proposed remaining target is experience itself, rather than another performance capacity.'),
  q('hard-2', 'hard-problem', '“No one has explained why this brain activity feels like anything; therefore a nonphysical mind exists.” What is missing?', [
    'An argument from the explanatory gap to the proposed ontology.', 'A measurement showing that the activity occurs during experience.', 'An agreement to use “consciousness” only for verbal reporting.', 'A demonstration that explaining attention is scientifically easy.',
  ], 'An unsolved explanatory question does not alone establish what kinds of things exist.'),
  q('qualia-1', 'qualia', 'An illusionist offers a mechanism explaining why we judge that we have private phenomenal properties. Which reply addresses the central dispute?', [
    'Does explaining that judgment also account for felt experience?', 'Does the mechanism imply that no sensory processing takes place?', 'Does the mechanism require people to be lying about their pain?', 'Does explaining a judgment establish substance dualism?',
  ], 'The disputed move is from an account of introspective judgments to an account of, or challenge to, phenomenal properties.'),
  q('qualia-2', 'qualia', 'Two writers disagree about whether qualia exist. What should be clarified before treating their claims as contradictory?', [
    'Whether “qualia” means felt qualities broadly or a stronger package of properties.', 'Whether both writers have personally experienced exactly the same shade of red.', 'Whether both writers endorse the same theory of computational implementation.', 'Whether their descriptions of experience use the same everyday vocabulary.',
  ], 'Different definitions of qualia can make an apparent disagreement misleading.'),
  q('physical-1', 'physicalism', '“Minds are physical, so any program with human-level language skills must be conscious.” Which additional claim is needed?', [
    'That the program instantiates properties sufficient for experience.', 'That biological brains are made of physical material.', 'That language skills admit some physical explanation.', 'That nonphysical substances are unnecessary for language.',
  ], 'Physicalism alone leaves open which physical or computational properties suffice.'),
  q('physical-2', 'physicalism', 'A researcher holds that experience is a biological process and that computation alone is insufficient. This position is:', [
    'Compatible with physicalism while rejecting computational sufficiency.', 'Incompatible with physicalism because biology is not computation.', 'Committed to a separate mental substance alongside the brain.', 'Committed to denying conscious experience in biological organisms.',
  ], 'One can regard the mind as physical while requiring particular biological properties.'),
  q('function-1', 'functionalism', 'A playback device recites a person’s recorded conversation. Why is that not by itself a demonstration of functional equivalence?', [
    'Matching a transcript need not match internal causal roles.', 'Functional roles concern material composition rather than causal links.', 'Functional equivalence requires the two systems to share a history.', 'Matching words rules out a match in the relevant mental states.',
  ], 'Functional organization includes internal relations and responses under different circumstances, not just recorded outputs.'),
  q('function-2', 'functionalism', 'Which objection directly challenges functionalism about phenomenal consciousness?', [
    'Even the same causal organization might leave felt character unfixed.', 'Different materials can implement the same causal organization.', 'Mental states can influence other mental states within a system.', 'A transcript may omit the internal organization of its speaker.',
  ], 'The challenge grants the relevant organization and questions whether it suffices for experience.'),
  q('substrate-1', 'substrate', 'Suppose pain is realized by very different physical mechanisms in two species. What does that most directly challenge?', [
    'Identifying all pain with one narrowly specified physical kind.', 'Treating either species as having any physical organization.', 'Describing pain as having causes and behavioral consequences.', 'Allowing the two species to share a kind of mental state.',
  ], 'Multiple realizability challenges a simple one-to-one type identity, rather than physical explanation generally.'),
  q('substrate-2', 'substrate', '“The same mental state can have different physical realizations; therefore this chatbot feels pain.” What remains to be shown?', [
    'That this chatbot is one of the relevant realizations.', 'That the chatbot and a brain are made of identical materials.', 'That every physical system realizes the same mental states.', 'That mental kinds cannot be shared across different species.',
  ], 'A possibility of different realizations does not identify any particular system as one.'),
  q('mary-1', 'mary', 'Mary knows all physical facts but has never seen color. The knowledge argument challenges physicalism if her first color experience provides:', [
    'A fact not included in all the physical facts she already knew.', 'A new ability to recognize a previously studied color.', 'A new opportunity to recall information she already possessed.', 'A familiar fact encountered through a different mode of presentation.',
  ], 'The anti-physicalist inference needs new factual knowledge beyond the physical account; competing replies dispute that characterization.'),
  q('mary-2', 'mary', 'Which is the ability reply to Mary’s learning on first seeing red?', [
    'She gains skills of recognition or imagination, rather than a new nonphysical fact.', 'She gains a new nonphysical fact that completes the physical account.', 'She knew too few physical facts, contrary to the thought experiment’s premise.', 'She learns that seeing red requires a substance separate from the body.',
  ], 'The ability reply treats the gain as know-how. It is a reply to assess, not a required philosophical allegiance.'),
  q('zombie-1', 'zombies', 'Someone claims to conceive of a complete physical duplicate with no experience. What further step does the anti-physicalist argument need?', [
    'A defensible bridge from the relevant conceivability to metaphysical possibility.', 'An observation of a person who reports having no conscious experience.', 'An explanation of why the duplicate behaves differently from the original.', 'A demonstration that the duplicate is assembled from nonbiological materials.',
  ], 'Conceivability and possibility are distinct claims. The zombie argument needs both to be defended.'),
  q('zombie-2', 'zombies', 'Which scenario is the philosophical zombie relevant to the argument against physicalism?', [
    'A full physical duplicate of a conscious person, stipulated to lack experience.', 'A robot that behaves like a person but uses a different physical architecture.', 'A person who is conscious but cannot form reports about their experiences.', 'A person whose experiences differ because their physical brain has changed.',
  ], 'The relevant duplicate holds the physical facts fixed while varying the phenomenal facts.'),
  q('room-1', 'chinese-room', 'The Chinese Room’s operator follows rules without understanding Chinese. The systems reply says:', [
    'The organized whole could understand even if that component does not.', 'The operator understands every symbol simply by following its rule.', 'The output must be unintelligible if the operator lacks understanding.', 'Understanding is irrelevant to the argument’s claim about programs.',
  ], 'The systems reply challenges the inference from the component’s ignorance to the whole system’s ignorance.'),
  q('room-2', 'chinese-room', 'What is the Chinese Room argument principally directed against?', [
    'Formal program execution being sufficient for understanding.', 'Physical machinery being capable of producing mental activity.', 'Computer models being useful for studying human cognition.', 'People learning to understand languages by interacting with others.',
  ], 'The target is sufficiency of formal computation, not the claim that physical machines can ever think.'),
  q('minds-1', 'other-minds', 'A system says “I feel afraid.” Which investigation is most relevant to how much evidence this provides?', [
    'How the report is generated and related to the system’s internal processes.', 'Whether the report uses the same words as a familiar human expression.', 'Whether the report is longer than a typical human description of fear.', 'Whether the report is received by someone who believes machines can feel.',
  ], 'Reports are evidence to interpret in context, not self-authenticating certificates of experience.'),
  q('minds-2', 'other-minds', '“We cannot directly inspect its experience, so it has none.” The inference confuses:', [
    'A limitation on our knowledge with a conclusion about what exists.', 'A conclusion about physical structure with a measurement of that structure.', 'A claim about possible experience with a claim about verbal intelligence.', 'An explanation of first-person knowledge with evidence of perfect access.',
  ], 'Lack of direct access does not entail absence. This issue also arises when considering other people.'),
  q('neural-1', 'neural', 'Brain activity reliably appears when people report seeing a stimulus. Why investigate trials without a report requirement?', [
    'To help separate experience-related activity from report preparation.', 'To establish that behavior can never be evidence about experience.', 'To prove that the activity is sufficient for every kind of experience.', 'To replace the question of experience with a question about vocabulary.',
  ], 'A correlation with reports may include processes required for reporting rather than for experience itself.'),
  q('neural-2', 'neural', 'A reliable neural correlate of seeing red has been found. Which conclusion exceeds that finding alone?', [
    'The finding explains why that activity constitutes the experience of red.', 'The activity is associated with seeing red in the studied conditions.', 'The activity is a candidate for further causal investigation.', 'The finding constrains accounts of visual experience in those conditions.',
  ], 'Correlation is valuable evidence, but is not by itself a constitutive explanation.'),
  q('theory-1', 'theories', 'Which contrast accurately describes two approaches to consciousness?', [
    'Workspace: broad availability; higher-order: suitable representation of a mental state.', 'Workspace: separate mental substance; higher-order: broad availability of sensory input.', 'Workspace: exact verbal fluency; higher-order: any first-order response to a stimulus.', 'Workspace: universal mentality; higher-order: identity with one specific biological tissue.',
  ], 'Workspace accounts emphasize broadcast; higher-order accounts emphasize a representation of the target state.'),
  q('theory-2', 'theories', 'On an actualist higher-order thought account, what distinguishes a conscious perception from an otherwise similar nonconscious perception?', [
    'It is the target of a suitable higher-order thought.', 'It is caused by a stimulus outside the organism.', 'It leads to a first-order discrimination of a stimulus.', 'It occurs in a system with the capacity to speak.',
  ], 'This version requires an actual suitable higher-order thought; other higher-order versions differ.'),
  q('pan-1', 'panpsychism', 'What is the combination problem for a view with basic experiential subjects?', [
    'How those subjects could constitute a unified complex experience.', 'How to show that every ordinary object uses human language.', 'How to remove all experiential properties from the physical world.', 'How one complex experience proves every component is unconscious.',
  ], 'Basic mentality does not on its own explain a unified subject at another level.'),
  q('pan-2', 'panpsychism', '“Basic matter has experiential aspects, so this rock has a human-like mind.” Which move is unsupported?', [
    'From basic experiential aspects to an organized human-like subject.', 'From a familiar theory of matter to a claim about basic mentality.', 'From human consciousness to a demand for a physical explanation.', 'From the existence of objects to the existence of their constituents.',
  ], 'Panpsychism need not assign human cognition or a unified subject to every collection of matter.'),
  q('dual-1', 'dualism', 'A theory posits irreducible mental properties but no separate mental substance. It is most naturally described as:', [
    'Property dualism.', 'Substance dualism.', 'Type identity physicalism.', 'Eliminativism about experience.',
  ], 'Property dualism and substance dualism make different claims about what is irreducibly mental.'),
  q('dual-2', 'dualism', 'An interactionist substance dualist says intentions affect bodily movement. Which question most directly presses this view?', [
    'How a nonphysical substance causally influences physical events.', 'How mental vocabulary differs from vocabulary used in physics.', 'Whether bodily movement is observable by other people.', 'Whether intentions can be described without naming neurons.',
  ], 'Interaction requires an account of causation across the proposed mental–physical distinction.'),
  q('cause-1', 'causation', 'Which claim characterizes epiphenomenalism about conscious mental events?', [
    'They are physically caused but do not affect physical events.', 'They do not occur, though people mistakenly report them.', 'They are identical with physical causes of bodily movement.', 'They initiate physical events without having physical causes.',
  ], 'Epiphenomenalism denies physical causal influence, not the occurrence of experience.'),
  q('cause-2', 'causation', 'If a bodily movement already has a sufficient physical cause, what question arises for a distinct mental cause?', [
    'How it contributes without redundant causal competition.', 'Whether bodily movements ever have physical explanations.', 'Whether the intention can be described in ordinary language.', 'Whether the person can report having formed an intention.',
  ], 'The challenge concerns fitting mental causation into an apparently sufficient physical causal story.'),
];

export type Question = { id: string; topic: string; prompt: string; options: { id: string; text: string; correct: boolean }[]; explanation: string; sources: Topic['sources'] };
export function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const range = i + 1;
    const limit = Math.floor(0x100000000 / range) * range;
    let random: number;
    do { random = crypto.getRandomValues(new Uint32Array(1))[0]; } while (random >= limit);
    const j = random % range;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createQuestions(): Question[] {
  return shuffle(topics.filter(t => bank.some(q => q.topic === t.id)).map(topic => {
    const item = shuffle(bank.filter(q => q.topic === topic.id))[0];
    return { id: crypto.randomUUID(), topic: item.topic, prompt: item.prompt, explanation: item.explanation, sources: topic.sources,
      options: shuffle(item.answers.map((text, i) => ({ id: crypto.randomUUID(), text, correct: i === 0 }))) };
  }));
}
export function publicQuestions(questions: Question[]) {
  return questions.map(({ id, prompt, options }) => ({ id, prompt, options: options.map(({ id, text }) => ({ id, text })) }));
}
