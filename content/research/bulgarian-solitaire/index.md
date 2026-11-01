---
title: "Bulgarian solitaire"
description: "Bulgarian solitaire — Vikum Bandara."
---

Bulgarian solitaire starts with a collection of cards divided into stacks. At each step, take one card from every stack and use the collected cards to form a new stack. Empty stacks disappear. For example, stacks of sizes 3, 1, and 1 become stacks of sizes 3 and 2: three cards form the new stack, while two remain in the original largest stack.

In the classical game, only the stack sizes matter. They describe a partition of the total number of cards, and repeated moves eventually enter a cycle because there are only finitely many possible partitions. This makes a simple card game a setting for studying discrete dynamics: how an arrangement evolves under a fixed rule, and when it returns to a previous state.

My work with Dr. Svetlana Poznanović asks what happens when the cards are distinguishable. Returning to the same stack sizes need not return each card to its original position. We represent the stacks as columns of labeled cells and track how the labels move. Choices that are invisible in the classical game—such as removing a card from the top or bottom of a stack, and ordering the cards in the new stack—now matter. The motivation is to understand how the repeating pattern of stack shapes relates to the motion of the individual cards.

## Related preprint

{{< vikum-document path="papers/bulgarian-solitaire.pdf" label="Bulgarian solitaire with distinguishable cells" >}}
