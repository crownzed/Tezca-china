import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const asset = await readFile(new URL('public/models/streak/streak-flame-v1.glb', root));
const chunks = [];
for (let offset = 12; offset < asset.length;) {
  assert.ok(offset + 8 <= asset.length, 'complete chunk header');
  const length = asset.readUInt32LE(offset);
  assert.equal(length % 4, 0, 'aligned GLB chunk');
  assert.ok(offset + 8 + length <= asset.length, 'chunk fits the file');
  chunks.push({ type: asset.readUInt32LE(offset + 4), bytes: asset.subarray(offset + 8, offset + 8 + length) });
  offset += 8 + length;
}
const gltf = JSON.parse(chunks[0].bytes.toString('utf8'));
const binary = chunks.find(chunk => chunk.type === 0x004e4942)?.bytes;
const parts = ['Core', 'Halo', 'Inner', 'Outer', 'Pedestal'].map(part => `StreakFlame_${part}`);

// Read the actual embedded data, rather than only trusting accessor min/max metadata.
function readAccessor(index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const dimensions = { SCALAR: 1, VEC3: 3 }[accessor.type];
  const component = {
    5121: { bytes: 1, read: offset => binary.readUInt8(offset) },
    5123: { bytes: 2, read: offset => binary.readUInt16LE(offset) },
    5125: { bytes: 4, read: offset => binary.readUInt32LE(offset) },
    5126: { bytes: 4, read: offset => binary.readFloatLE(offset) },
  }[accessor.componentType];
  assert.ok(dimensions && component, 'supported uncompressed accessor');
  assert.equal(view.buffer, 0);
  assert.equal(accessor.sparse, undefined);
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || component.bytes * dimensions;
  assert.ok(start + (accessor.count - 1) * stride + component.bytes * dimensions <= (view.byteOffset || 0) + view.byteLength);
  return Array.from({ length: accessor.count }, (_, row) => (
    Array.from({ length: dimensions }, (_, col) => component.read(start + row * stride + col * component.bytes))
  ));
}

test('Blender source, rebuild script, preview and web model exist and are nonempty', async () => {
  for (const path of [
    'assets/streak/streak-flame-v1.blend',
    'assets/streak/streak-flame-preview.png',
    'scripts/blender/build_streak_flame.py',
    'public/models/streak/streak-flame-v1.glb',
  ]) {
    const info = await stat(new URL(path, root));
    assert.ok(info.isFile() && info.size > 0, path);
  }
});

test('web asset is a complete GLB 2 file within the 500 KB budget', () => {
  assert.equal(asset.readUInt32LE(0), 0x46546c67);
  assert.equal(asset.readUInt32LE(4), 2);
  assert.equal(asset.readUInt32LE(8), asset.length);
  assert.ok(asset.length <= 500_000, `${asset.length} bytes`);
  assert.deepEqual(chunks.map(chunk => chunk.type), [0x4e4f534a, 0x004e4942]);
  assert.equal(gltf.asset.version, '2.0');
  assert.equal(gltf.buffers.length, 1);
  assert.ok(binary.length >= gltf.buffers[0].byteLength);
  assert.ok(binary.length - gltf.buffers[0].byteLength <= 3);
  for (const view of gltf.bufferViews) {
    assert.equal(view.buffer, 0);
    assert.ok((view.byteOffset || 0) + view.byteLength <= gltf.buffers[0].byteLength);
  }
});

test('only the five named flame meshes are exported, without preview lights or cameras', () => {
  assert.deepEqual(gltf.nodes.map(node => node.name).sort(), [...parts].sort());
  assert.deepEqual(gltf.meshes.map(mesh => mesh.name).sort(), parts.map(part => `${part}_Mesh`).sort());
  assert.equal(gltf.scenes.length, 1);
  assert.equal(gltf.scenes[gltf.scene || 0].nodes.length, 5);
  assert.equal(gltf.cameras?.length || 0, 0);
  assert.equal(gltf.extensions?.KHR_lights_punctual, undefined);
  assert.equal(gltf.animations?.length || 0, 0);
  for (const node of gltf.nodes) {
    assert.ok(gltf.meshes[node.mesh]);
    assert.equal(node.camera, undefined);
    assert.equal(node.extras.streak_asset_owner, 'tezca-streak-flame-v1');
    assert.equal(node.extras.streak_asset_part, node.name);
    assert.equal(node.matrix, undefined, 'Y-up positions are baked into the exported mesh');
    assert.equal(node.rotation, undefined);
    assert.equal(node.translation, undefined);
    assert.equal(node.scale, undefined);
  }
});

test('PBR materials are named and the asset has no external resources or decoder dependency', () => {
  assert.deepEqual(gltf.materials.map(material => material.name).sort(), [
    'StreakFlame_Core_Mat', 'StreakFlame_Halo_Mat', 'StreakFlame_Inner_Mat',
    'StreakFlame_Outer_Mat', 'StreakFlame_Base_Mat',
  ].sort());
  for (const material of gltf.materials) {
    assert.ok(material.pbrMetallicRoughness);
    assert.equal(material.pbrMetallicRoughness.baseColorFactor.length, 4);
    assert.ok(material.emissiveFactor.every(Number.isFinite));
  }
  assert.equal(gltf.images?.length || 0, 0);
  assert.equal(gltf.textures?.length || 0, 0);
  assert.ok(gltf.buffers.every(buffer => buffer.uri === undefined));
  const supported = new Set(['KHR_materials_clearcoat', 'KHR_materials_emissive_strength']);
  for (const extension of [...(gltf.extensionsUsed || []), ...(gltf.extensionsRequired || [])]) {
    assert.ok(supported.has(extension), `unexpected extension: ${extension}`);
  }
});

test('embedded triangles are valid, finite and within the 12,000 triangle budget', () => {
  let triangles = 0;
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      assert.equal(primitive.mode ?? 4, 4);
      assert.ok(gltf.materials[primitive.material]);
      const positions = readAccessor(primitive.attributes.POSITION);
      const normals = readAccessor(primitive.attributes.NORMAL);
      const indices = readAccessor(primitive.indices).flat();
      assert.equal(normals.length, positions.length);
      assert.equal(indices.length % 3, 0);
      assert.ok(positions.flat().every(Number.isFinite));
      assert.ok(normals.flat().every(Number.isFinite));
      assert.ok(indices.every(index => Number.isInteger(index) && index >= 0 && index < positions.length));
      triangles += indices.length / 3;
    }
  }
  assert.ok(triangles > 0 && triangles <= 12_000, `${triangles} triangles`);
});

test('actual bounds match metadata, stand on Y=0 and face their core toward +Z', () => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      const values = readAccessor(primitive.attributes.POSITION);
      for (let axis = 0; axis < 3; axis++) {
        const low = Math.min(...values.map(value => value[axis]));
        const high = Math.max(...values.map(value => value[axis]));
        assert.ok(Math.abs(low - accessor.min[axis]) < 0.00001);
        assert.ok(Math.abs(high - accessor.max[axis]) < 0.00001);
        min[axis] = Math.min(min[axis], low);
        max[axis] = Math.max(max[axis], high);
      }
    }
  }
  const size = max.map((value, axis) => value - min[axis]);
  assert.ok(Math.abs(min[1]) < 0.00001);
  assert.ok(size[1] > 2.3 && size[1] < 2.5, 'stable web camera framing');
  assert.ok(size[1] > size[0] && size[1] > size[2], 'flame is Y-up');
  assert.ok(size[0] > 1 && size[0] < 2 && size[2] > 1 && size[2] < 2);
  const core = gltf.meshes[gltf.nodes.find(node => node.name === 'StreakFlame_Core').mesh];
  assert.ok(gltf.accessors[core.primitives[0].attributes.POSITION].min[2] > 0);
});
