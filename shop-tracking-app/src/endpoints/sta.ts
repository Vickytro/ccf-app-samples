import * as ccfapp from "@microsoft/ccf-app";
import { ccf } from "@microsoft/ccf-app/global";

function parseRequestQuery(request: ccfapp.Request<any>): any {
  const elements = request.query.split("&");
  const obj = {};
  for (const kv of elements) {
    const [k, v] = kv.split("=");
    obj[k] = v;
  }
  return obj;
}

interface Caller {
  id: string;
}

function getCallerId(request: ccfapp.Request<any>): string {
  // Note that the following way of getting caller ID doesn't work for 'jwt' auth policy and 'no_auth' auth policy.
  const caller = request.caller as unknown as Caller;
  return caller.id;
}

function isUser(userId: string): boolean {
  // Check if user exists
  // https://microsoft.github.io/CCF/main/audit/builtin_maps.html#users-info
  const usersCerts = ccfapp.typedKv(
    "public:ccf.gov.users.certs",
    ccfapp.arrayBuffer,
    ccfapp.arrayBuffer
  );
  return usersCerts.has(ccf.strToBuf(userId));
}

function isMember(memberId: string): boolean {
  // Check if member exists
  // https://microsoft.github.io/CCF/main/audit/builtin_maps.html#users-info
  const membersCerts = ccfapp.typedKv(
    "public:ccf.gov.members.certs",
    ccfapp.arrayBuffer,
    ccfapp.arrayBuffer
  );
  return membersCerts.has(ccf.strToBuf(memberId));
}

interface Range {
  start?: number;
  last?: number;
}

type LogIdAccessType = "ANY" | "SPECIFIED_RANGE";
interface LogIdAccess {
  type: LogIdAccessType;
  // Only for "SPECIFIED_RANGE"
  range?: Range;
}

type SeqNoAccessType = "ANY" | "ONLY_LATEST" | "SPECIFIED_RANGE";
interface SeqNoAccess {
  type: SeqNoAccessType;
  // Only for "SPECIFIED_RANGE"
  range?: Range;
}

interface PermissionItem {
  logId: LogIdAccess;
  seqNo: SeqNoAccess;
}

const permissionTableName = "log_access_permissions";
const userIdToPermission = ccfapp.typedKv(
  permissionTableName,
  ccfapp.string /** User ID */,
  ccfapp.json<PermissionItem>()
);

/**
 * Check user's access to a log item
 *
 * If seqNo is not given, it returns whether if the user has access to the latest sequence number.
 */
function checkUserAccess(
  userId: string,
  logId: number,
  seqNo?: number
): boolean {
  // Access is not allowed if perssion is not set explicitly.
  if (!userIdToPermission.has(userId)) {
    return false;
  }

  // Check sequence number.
  const permission = userIdToPermission.get(userId);
  const usingHistoricalQueryBuItIsNotAllowed: boolean =
    permission.seqNo.type === "ONLY_LATEST" && typeof seqNo === "number";
  const outOfPermittedSeqNoRange: boolean =
    permission.seqNo.type === "SPECIFIED_RANGE" &&
    (seqNo === undefined ||
      (permission.seqNo.range.start === undefined &&
        permission.seqNo.range.last === undefined) ||
      (permission.seqNo.range.start !== undefined &&
        permission.seqNo.range.start > seqNo) ||
      (permission.seqNo.range.last !== undefined &&
        permission.seqNo.range.last < seqNo));
  if (usingHistoricalQueryBuItIsNotAllowed || outOfPermittedSeqNoRange) {
    return false;
  }

  // Check log ID.
  const outOfPermittedLogIdRange: boolean =
    permission.logId.type === "SPECIFIED_RANGE" &&
    ((permission.logId.range.start === undefined &&
      permission.logId.range.last === undefined) ||
      (permission.logId.range.start !== undefined &&
        permission.logId.range.start > logId) ||
      (permission.logId.range.last !== undefined &&
        permission.logId.range.last < logId));
  return !outOfPermittedLogIdRange;
}

interface Purchase {
  msg: string;
}
class PurchaseImpl implements Purchase{
  msg: string;
}

const customerPurchase = ccfapp.typedKv("customerPurchase", ccfapp.string, ccfapp.json<Purchase>());

export function recordUserID(
  request: ccfapp.Request
): ccfapp.Response {
  const input = request.body.json();
  let recordedPurchase = new PurchaseImpl();
  recordedPurchase.msg = input["timeStamp"];
  customerPurchase.set(input["email"], recordedPurchase);
  return {
    statusCode: 204
  };
};
