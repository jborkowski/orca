#include <metal_stdlib>
using namespace metal;

struct CellVertexIn {
  float2 position [[attribute(0)]];
  float2 uv [[attribute(1)]];
  float4 fg [[attribute(2)]];
  float4 bg [[attribute(3)]];
};

struct CellVertexOut {
  float4 position [[position]];
  float2 uv;
  float4 fg;
  float4 bg;
};

vertex CellVertexOut terminal_cell_vertex(CellVertexIn in [[stage_in]]) {
  CellVertexOut out;
  out.position = float4(in.position, 0.0, 1.0);
  out.uv = in.uv;
  out.fg = in.fg;
  out.bg = in.bg;
  return out;
}

fragment float4 terminal_cell_fragment(CellVertexOut in [[stage_in]],
                                       texture2d<float> glyphAtlas [[texture(0)]],
                                       sampler glyphSampler [[sampler(0)]]) {
  // Empty cells use UV (-1,-1); first atlas glyph may sit at (0,0).
  if (in.uv.x < 0.0f) {
    return in.bg;
  }
  float4 s = glyphAtlas.sample(glyphSampler, in.uv);
  // Colorful emoji/glyphs keep their RGB; mono coverage tints with cell fg.
  float chroma = abs(s.r - s.g) + abs(s.g - s.b);
  float coverage = max(s.a, max(s.r, max(s.g, s.b)));
  float4 glyphColor = chroma > 0.08
    ? float4(s.rgb / max(s.a, 0.001), s.a)
    : float4(in.fg.rgb, coverage);
  return mix(in.bg, float4(glyphColor.rgb, 1.0), glyphColor.a);
}
