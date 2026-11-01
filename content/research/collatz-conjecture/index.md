---
title: "Collatz conjecture"
description: "Collatz conjecture — Vikum Bandara."
---

Start with any positive integer. If it is even, divide it by 2; if it is odd, multiply it by 3 and add 1. Repeat the rule with each new number. For example, starting with 6 gives 6 → 3 → 10 → 5 → 16 → 8 → 4 → 2 → 1. The Collatz conjecture asks whether every positive starting value eventually reaches 1, after which the sequence repeats the cycle 1 → 4 → 2 → 1.

The rule is easy to carry out, but understanding all possible trajectories is much harder. A sequence can climb before it falls, and checking individual examples does not establish what happens for every positive integer. One useful perspective is to draw an arrow from each number to the next number in its sequence. This turns the question into a study of how arithmetic paths join together and whether any can avoid the familiar cycle.

In my work with Dr. Rajitha Ranasinghe, we explore the structure of these sequences and how Collatz-based iteration might be used in a proposed cryptographic framework. This connects a question in number theory with the design of encryption and decryption procedures. The conjecture remains the mathematical motivation; the proposed application also raises a separate question of how its security should be assessed.

## Related paper

{{< vikum-document path="papers/collatz-cryptography.pdf" label="Collatz conjecture–driven cryptographic framework" meta="Journal of Discrete Mathematical Sciences & Cryptography · 2026" >}}
