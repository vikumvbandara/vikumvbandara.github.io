---
title: "Protein geometry and urban thermal comfort"
description: "Four coordinate-based 3D design studies exploring how molecular geometry can inspire courtyard layouts and measurable urban-comfort questions."
manuscript: true
---

## Research project

Can spatial relationships measured in proteins generate useful three-dimensional residential layouts? This project builds four early-stage architectural massings from experimentally resolved biological coordinates, then asks how those geometries could be tested as urban forms.

The models are starting geometries, not finished buildings. They preserve a traceable relationship to the source structures while leaving the architectural decisions, thermal performance, feasibility, and originality open to independent testing.

## Rotate the four designs

Use the viewer below to compare each experimental protein backbone with its architectural translation. Drag either panel to rotate both views, choose a structure, and use **Reset view** to return to the starting orientation.

<div class="research-viewer-wrap">
  <iframe class="research-viewer" src="research/protein-buildings/" title="Rotatable protein and building design viewer" loading="lazy"></iframe>
</div>

<p class="research-viewer-link"><a href="research/protein-buildings/">Open the rotatable viewer in a full page</a></p>

## Four 3D design studies

<div class="research-model-grid">
  <article class="research-model-card">
    <p class="research-model-code">1SHS</p>
    <h3>Hsp16.5 cage district</h3>
    <p>A hollow, octahedrally symmetric shell with triangular and square opening families. Its window directions offer a controlled starting point for comparing courtyard apertures under changing wind directions.</p>
    <a href="https://www.rcsb.org/3d-view/1SHS/1" rel="noopener">Explore the experimental assembly</a>
  </article>
  <article class="research-model-card">
    <p class="research-model-code">3J5P</p>
    <h3>TRPV1 central-pore complex</h3>
    <p>Four subunits frame a common pore. The design question is whether a temperature-responsive passage can inspire an adaptive vent or courtyard opening when compared with a fixed control.</p>
    <a href="https://www.rcsb.org/3d-view/3J5P/1" rel="noopener">Explore the experimental assembly</a>
  </article>
  <article class="research-model-card">
    <p class="research-model-code">1GOW</p>
    <h3>Four-part glycosidase complex</h3>
    <p>A compact four-subunit assembly motivates a study of interfaces, spacing, shade, and wind while keeping site area and housing capacity comparable across designs.</p>
    <a href="https://www.rcsb.org/3d-view/1GOW/1" rel="noopener">Explore the experimental assembly</a>
  </article>
  <article class="research-model-card">
    <p class="research-model-code">1EZG</p>
    <h3>Antifreeze helical building</h3>
    <p>Repeating beta-helix traces inspire terrace-like architectural repetition. The urban study focuses on shade distribution; any frost-control claim would require separate materials and icing experiments.</p>
    <a href="https://www.rcsb.org/3d-view/1EZG/1" rel="noopener">Explore the experimental assembly</a>
  </article>
</div>

## Reproducible geometry

The Python workflow reads alpha-carbon coordinates from the four deposited structures, groups them by chain and assembly copy, centers and normalizes each assembly, and emits a compact data set for an interactive viewer. In the proposed building projection, each coordinate becomes a short horizontal architectural module. The modules are exploratory massings: they can overlap and are not habitable floor plans.

```python
center = [sum(p[i] for p in points) / len(points) for i in range(3)]
radius = max(math.dist(p, center) for p in points)
scaled = [[[round(70 * (x - c) / radius, 2)
            for x, c in zip(p, center)] for p in chain]
           for chain in chains.values()]
```

The normalization preserves relative distances up to display rounding and uses a common display scale within each candidate. The scale is normalized independently between candidates, so visual size should not be interpreted as molecular size.

## Proposed urban experiment

The next stage is a controlled comparison against a conventional residential layout. Hold site area, housing floor area, open-space area, height limits, materials, tree cover, weather hours, and observation points constant. Then compare pedestrian exposure, radiant temperature, shade hours, humidity, and wind speed at pedestrian height across the four candidates and a control.

A district-wide average can hide an exposed route, so each courtyard and path should be reported separately. The central hypothesis is deliberately modest: a biological structure may provide a reproducible geometric rule for generating a layout. It does not, by itself, establish better cooling, engineering suitability, or a world-first result.

## Reproduction notes

The supplied project package is designed to run with standard Python 3 and no third-party Python packages. Run `py build_designs.py` on Windows or `python3 build_designs.py` elsewhere. Use `all` for the four-candidate build, or select `1SHS`, `3J5P`, `1GOW`, or `1EZG` for an individual viewer. The bundled package contains the PDB inputs and viewer template; this website page currently presents the research summary and source-structure links.

## Research status

These are geometric pilots and research questions. The protein functions provide the biological context for choosing the four structures; they are not evidence of equivalent building-scale thermal behavior. Any performance claim should follow from matched simulations and physical validation.
