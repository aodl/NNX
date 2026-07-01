import { Principal } from '@icp-sdk/core/principal';
import { IcTopologyError, TOPOLOGY_ERROR_CODES } from './topology-errors.js';

const SUBNET_LIST_KEY = 'subnet_list';
const NODE_RECORD_KEY_PREFIX = 'node_record_';
const TEXT_ENCODER = new TextEncoder();

function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  return null;
}

function concatBytes(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function encodeVarint(value) {
  let remaining = BigInt(value);
  const out = [];
  while (remaining >= 0x80n) {
    out.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }
  out.push(Number(remaining));
  return Uint8Array.from(out);
}

function encodeBytesField(fieldNumber, value) {
  return concatBytes([
    encodeVarint(BigInt((fieldNumber << 3) | 2)),
    encodeVarint(BigInt(value.length)),
    value,
  ]);
}

function encodeRegistryGetValueRequest(key, version = null) {
  const fields = [];
  if (version !== null && version !== undefined) {
    fields.push(encodeBytesField(1, encodeVarint(BigInt(version))));
  }
  fields.push(encodeBytesField(2, TEXT_ENCODER.encode(key)));
  return concatBytes(fields);
}

function readVarint(data, offset) {
  let result = 0n;
  let shift = 0n;
  let index = offset;
  while (index < data.length) {
    const byte = data[index];
    result |= BigInt(byte & 0x7f) << shift;
    index += 1;
    if ((byte & 0x80) === 0) {
      return { value: result, offset: index };
    }
    shift += 7n;
  }
  throw new Error('Unexpected end of protobuf varint.');
}

function readLengthDelimited(data, offset) {
  const length = readVarint(data, offset);
  const end = length.offset + Number(length.value);
  if (end > data.length) throw new Error('Unexpected end of protobuf bytes field.');
  return {
    value: data.slice(length.offset, end),
    offset: end,
  };
}

function readString(data, offset) {
  const value = readLengthDelimited(data, offset);
  return {
    value: new TextDecoder().decode(value.value),
    offset: value.offset,
  };
}

function skipField(data, offset, wireType) {
  if (wireType === 0) return readVarint(data, offset).offset;
  if (wireType === 2) return readLengthDelimited(data, offset).offset;
  if (wireType === 1) return offset + 8;
  if (wireType === 5) return offset + 4;
  throw new Error(`Unsupported protobuf wire type ${wireType}.`);
}

function readFields(data, handlers) {
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarint(data, offset);
    offset = tag.offset;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 0x07n);
    const handler = handlers[fieldNumber];
    if (handler) {
      offset = handler(data, offset, wireType);
    } else {
      offset = skipField(data, offset, wireType);
    }
    if (offset > data.length) throw new Error('Protobuf field exceeded message length.');
  }
}

function decodeRegistryError(data) {
  const error = { code: null, reason: '', key: null };
  readFields(data, {
    1: (fieldData, offset, wireType) => {
      if (wireType !== 0) throw new Error('RegistryError.code had invalid wire type.');
      const value = readVarint(fieldData, offset);
      error.code = Number(value.value);
      return value.offset;
    },
    2: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('RegistryError.reason had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      error.reason = new TextDecoder().decode(value.value);
      return value.offset;
    },
    3: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('RegistryError.key had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      error.key = value.value;
      return value.offset;
    },
  });
  return error;
}

export function decodeRegistryGetValueResponse(data) {
  const response = {
    error: null,
    version: null,
    value: null,
    largeValueChunkKeys: null,
    timestampNanoseconds: null,
  };

  readFields(bytes(data) ?? new Uint8Array(), {
    1: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('Registry get_value error had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      response.error = decodeRegistryError(value.value);
      return value.offset;
    },
    2: (fieldData, offset, wireType) => {
      if (wireType !== 0) throw new Error('Registry get_value version had invalid wire type.');
      const value = readVarint(fieldData, offset);
      response.version = value.value;
      return value.offset;
    },
    3: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('Registry get_value value had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      response.value = value.value;
      return value.offset;
    },
    4: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('Registry get_value large value marker had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      response.largeValueChunkKeys = value.value;
      return value.offset;
    },
    5: (fieldData, offset, wireType) => {
      if (wireType !== 0) throw new Error('Registry get_value timestamp had invalid wire type.');
      const value = readVarint(fieldData, offset);
      response.timestampNanoseconds = value.value;
      return value.offset;
    },
  });

  return response;
}

export function decodeSubnetListRecord(data) {
  const subnetIds = [];
  readFields(bytes(data) ?? new Uint8Array(), {
    2: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('SubnetListRecord.subnets had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      subnetIds.push(Principal.fromUint8Array(value.value).toText());
      return value.offset;
    },
  });
  return subnetIds;
}

export function decodeNodeRecord(data) {
  const node = {
    nodeOperatorId: null,
    publicIpv4: null,
    domain: null,
    httpEndpoint: null,
    xnetEndpoint: null,
    hostosVersionId: null,
    rewardType: null,
  };

  function decodeConnectionEndpoint(value) {
    const endpoint = { ipAddr: null, port: null };
    readFields(value, {
      1: (fieldData, offset, wireType) => {
        if (wireType !== 2) throw new Error('ConnectionEndpoint.ip_addr had invalid wire type.');
        const result = readString(fieldData, offset);
        endpoint.ipAddr = result.value || null;
        return result.offset;
      },
      2: (fieldData, offset, wireType) => {
        if (wireType !== 0) throw new Error('ConnectionEndpoint.port had invalid wire type.');
        const result = readVarint(fieldData, offset);
        endpoint.port = Number(result.value);
        return result.offset;
      },
    });
    if (!endpoint.ipAddr) return null;
    return endpoint.port === null ? endpoint.ipAddr : `${endpoint.ipAddr}:${endpoint.port}`;
  }

  function decodePublicIpv4(value) {
    const ipv4 = { ipAddr: null, gatewayIpAddr: [], prefixLength: null };
    readFields(value, {
      1: (fieldData, offset, wireType) => {
        if (wireType !== 2) throw new Error('IPv4InterfaceConfig.ip_addr had invalid wire type.');
        const result = readString(fieldData, offset);
        ipv4.ipAddr = result.value || null;
        return result.offset;
      },
      2: (fieldData, offset, wireType) => {
        if (wireType !== 2) throw new Error('IPv4InterfaceConfig.gateway_ip_addr had invalid wire type.');
        const result = readString(fieldData, offset);
        if (result.value) ipv4.gatewayIpAddr.push(result.value);
        return result.offset;
      },
      3: (fieldData, offset, wireType) => {
        if (wireType !== 0) throw new Error('IPv4InterfaceConfig.prefix_length had invalid wire type.');
        const result = readVarint(fieldData, offset);
        ipv4.prefixLength = Number(result.value);
        return result.offset;
      },
    });
    return ipv4.ipAddr || ipv4.gatewayIpAddr.length || ipv4.prefixLength !== null ? ipv4 : null;
  }

  readFields(bytes(data) ?? new Uint8Array(), {
    5: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('NodeRecord.xnet had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      node.xnetEndpoint = decodeConnectionEndpoint(value.value);
      return value.offset;
    },
    6: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('NodeRecord.http had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      node.httpEndpoint = decodeConnectionEndpoint(value.value);
      return value.offset;
    },
    15: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('NodeRecord.node_operator_id had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      node.nodeOperatorId = Principal.fromUint8Array(value.value).toText();
      return value.offset;
    },
    17: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('NodeRecord.hostos_version_id had invalid wire type.');
      const value = readString(fieldData, offset);
      node.hostosVersionId = value.value || null;
      return value.offset;
    },
    18: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('NodeRecord.public_ipv4_config had invalid wire type.');
      const value = readLengthDelimited(fieldData, offset);
      node.publicIpv4 = decodePublicIpv4(value.value);
      return value.offset;
    },
    19: (fieldData, offset, wireType) => {
      if (wireType !== 2) throw new Error('NodeRecord.domain had invalid wire type.');
      const value = readString(fieldData, offset);
      node.domain = value.value || null;
      return value.offset;
    },
    20: (fieldData, offset, wireType) => {
      if (wireType !== 0) throw new Error('NodeRecord.node_reward_type had invalid wire type.');
      const value = readVarint(fieldData, offset);
      node.rewardType = `type:${value.value.toString()}`;
      return value.offset;
    },
  });

  return node;
}

function nodeRecordKey(nodeId) {
  return `${NODE_RECORD_KEY_PREFIX}${nodeId}`;
}

export function createRawRegistryClient({ agent, registryCanisterId } = {}) {
  if (!agent?.query || typeof registryCanisterId !== 'string' || registryCanisterId.length === 0) {
    throw new IcTopologyError(
      TOPOLOGY_ERROR_CODES.RAW_REGISTRY_UNAVAILABLE,
      'Raw Registry discovery requires an agent and Registry canister ID.',
    );
  }

  async function getRawRegistryRecord(key) {
    let response;
    try {
      response = await agent.query(registryCanisterId, {
        methodName: 'get_value',
        arg: encodeRegistryGetValueRequest(key),
      });
    } catch (error) {
      throw new IcTopologyError(
        TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
        'Failed to call raw Registry get_value.',
        error,
      );
    }

    if (response?.status !== 'replied' || !response?.reply?.arg) {
      throw new IcTopologyError(
        TOPOLOGY_ERROR_CODES.REGISTRY_CALL_FAILED,
        'Raw Registry get_value did not return a reply.',
        response,
      );
    }

    let decoded;
    try {
      decoded = decodeRegistryGetValueResponse(response.reply.arg);
    } catch (error) {
      throw new IcTopologyError(
        TOPOLOGY_ERROR_CODES.REGISTRY_RECORD_DECODE_FAILED,
        'Failed to decode raw Registry get_value response.',
        error,
      );
    }

    if (decoded.error) {
      throw new IcTopologyError(
        TOPOLOGY_ERROR_CODES.REGISTRY_RECORD_UNAVAILABLE,
        'Registry returned an error for a raw get_value query.',
        {
          key,
          code: decoded.error.code,
          reason: decoded.error.reason,
        },
      );
    }

    if (!decoded.value) {
      throw new IcTopologyError(
        decoded.largeValueChunkKeys
          ? TOPOLOGY_ERROR_CODES.REGISTRY_LARGE_VALUE_UNSUPPORTED
          : TOPOLOGY_ERROR_CODES.REGISTRY_RECORD_UNAVAILABLE,
        'Raw Registry get_value returned a chunked or empty value that this client cannot decode.',
        { key },
      );
    }

    return {
      key,
      value: decoded.value,
      version: decoded.version,
      timestampNanoseconds: decoded.timestampNanoseconds,
    };
  }

  async function getRawRegistryValue(key) {
    const record = await getRawRegistryRecord(key);
    return record.value;
  }

  async function listSubnetIds() {
    return (await listSubnetIdsWithVersion()).subnetIds;
  }

  async function listSubnetIdsWithVersion() {
    const record = await getRawRegistryRecord(SUBNET_LIST_KEY);
    try {
      return {
        subnetIds: decodeSubnetListRecord(record.value),
        version: record.version,
      };
    } catch (error) {
      throw new IcTopologyError(
        TOPOLOGY_ERROR_CODES.REGISTRY_RECORD_DECODE_FAILED,
        'Failed to decode Registry subnet_list record.',
        error,
      );
    }
  }

  async function getNodeRecord(nodeId) {
    return (await getNodeRecordWithVersion(nodeId)).nodeRecord;
  }

  async function getNodeRecordWithVersion(nodeId) {
    const record = await getRawRegistryRecord(nodeRecordKey(nodeId));
    try {
      return {
        nodeRecord: {
          nodeId,
          ...decodeNodeRecord(record.value),
        },
        version: record.version,
      };
    } catch (error) {
      throw new IcTopologyError(
        TOPOLOGY_ERROR_CODES.REGISTRY_RECORD_DECODE_FAILED,
        'Failed to decode Registry node record.',
        error,
      );
    }
  }

  return Object.freeze({
    listSubnetIds,
    listSubnetIdsWithVersion,
    getSubnetList: listSubnetIds,
    getNodeRecord,
    getNodeRecordWithVersion,
    getRawRegistryRecord,
  });
}
