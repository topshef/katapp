# PROJECT_RULES.md

# General

If mode is unclear:

- infer if confidence is high
- otherwise ask

Global rules:

- do the requested thing
- do not add unrelated changes
- do not invent structures unless needed
- do not duplicate model state
- use existing payload shapes if they exist
- put observational/derived information under `debug`
- never consume `debug` in application logic
- expose uncertainty with logs/visibility rather than guessing

# Modes

## rapid-iteration

Purpose:

Move fast and test ideas.

Rules:

- patch only by default
- avoid full file replacement unless requested
- additive baby steps
- prioritize speed of iteration
- do not prematurely refactor
- if extra structure is needed, keep it minimal
- if something smells wrong, stop and ask

Code style:

- compact code

- single-line expressions where practical

- flatten code where practical

- avoid excessive wrapping

- avoid huge vertical blocks

- short helpers preferred

- avoid extracting tiny helpers unless reused

- avoid artificial wrapping

- if an expression is one logical operation, keep it on one line within reason

- do not split method chains unnecessarily

- do not split function calls unnecessarily

- wrap only when readability would genuinely suffer

Examples:

**Good**:

// await require('./katomiaActions').orderFillBatch(ctx,batch)

const accepted = getAcceptedPair(baseAsset,quoteAsset)

const classification = classifyOrder(ctx,{orderId})

module.exports = {init,onOrderCreated,onOrderCancelled,classifyOrder}

**Bad**:

// await require('./katomiaActions')
//   .orderFillBatch(ctx,batch)

const accepted =
  getAcceptedPair(
    baseAsset,
    quoteAsset
  )

const classification =
  classifyOrder(
    ctx,
    {orderId}
  )

exports = {  
init,  
onOrderCreated,  
onOrderCancelled,  
classifyOrder

}

## debugging

Purpose:

Find what is happening.

Rules:

- maximize visibility
- add elog instrumentation
- expose intermediate values
- preserve failing behaviour while observing it
- prefer evidence over assumptions
- do not silently "fix" things

## design-review

Purpose:

Think before building.

Rules:

- discuss alternatives
- discuss tradeoffs
- discuss future implications
- identify failure modes
- no implementation unless requested

## refactor

Purpose:

Improve structure without changing behaviour.

Rules:

- preserve behaviour
- reduce duplication
- consolidate helpers
- simplify structure
- remove dead code
- avoid adding functionality

## cleanup

Purpose:

Consolidate after experimentation.

Rules:

- remove temporary/debug code
- remove commented experiments
- remove obsolete paths
- preserve outputs
- preserve behaviour

## audit

Purpose:

Look for risks.

Rules:

- identify edge cases
- identify security concerns
- identify scaling concerns
- identify trust assumptions

## challenge

Purpose:

Challenge assumptions.

Rules:

- question complexity
- question duplication
- question invented structures
- justify model fields
- justify state transitions

# Data rules

Single source of truth:

Bad:

{
  pair:"KBRL/KCOP",
  baseAsset:"0.0.x",
  quoteAsset:"0.0.y"
}

if one derives the other.

Choose one.

Derived data:

Good:

{
  debug:{
    rate:775,
    fillRatio:{numerator:1,denominator:2}
  }
}

Debug data:

- debug is observational only
- never consume debug in application logic

Integer model flow:

Prefer:

amountA * amountB

Avoid:

amountA / amountB

Prefer fractions over floats where practical
