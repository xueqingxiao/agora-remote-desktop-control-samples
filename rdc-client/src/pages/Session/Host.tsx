import React, { FC, useCallback, useEffect, useState } from 'react';
import { Button, Divider, List, message, Spin, Tabs } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { RDCRoleType, RDCRemotelyPastingCodes, RDCRemotelyPastingStatus } from 'agora-rdc-core';
import { Profile } from '../../api';
import { Profiles } from './Profiles';
import { useSession } from '../../hooks/session';
import { useEngines } from '../../hooks/engines';
import { useProfiles } from '../../hooks/profiles';
import { Controller } from './Controller';

export const Host: FC = () => {
  const session = useSession();
  const { rdcEngine } = useEngines();
  const profiles = useProfiles();
  const [userIdsUnderControl, setUserIdsUnderControl] = useState<string[]>([]);
  const [pasting, setPasting] = useState(false);

  const handleRequestControlAuthorized = useCallback(
    (userId: string) => setUserIdsUnderControl([...userIdsUnderControl, userId]),
    [userIdsUnderControl, setUserIdsUnderControl],
  );

  const handleRequestControlUnauthorized = useCallback(
    (userId: string) => {
      const profile = profiles.find((p) => p.userId === userId);
      if (profile) {
        message.warn(`${profile.name} is declined your request`);
      }
    },
    [profiles],
  );

  const handleQuitControlEvent = useCallback(
    (userId: string) => {
      const profile = profiles.find(p => p.userId === userId);
      if(profile) {
        message.info(`${profile.name} stopped his computer being controlled by you.`)
      }
      setUserIdsUnderControl(userIdsUnderControl.filter((userIdUC) => userIdUC !== userId))
    },
    [userIdsUnderControl, setUserIdsUnderControl],
  );

  const handleRemotePaste = useCallback((status: RDCRemotelyPastingStatus, code: RDCRemotelyPastingCodes) => {
    if (code === RDCRemotelyPastingCodes.SUCCEEDED && status === RDCRemotelyPastingStatus.STARTING) {
      setPasting(true);
    }

    if (code === RDCRemotelyPastingCodes.SUCCEEDED && status === RDCRemotelyPastingStatus.SUCCEEDED) {
      setPasting(false);
      message.success('File is pasted.');
    }

    if (code !== RDCRemotelyPastingCodes.SUCCEEDED && status === RDCRemotelyPastingStatus.FAILED) {
      message.error('Failed to pasting file.');
      setPasting(false);
    }
  }, []);

  const handleQuitControl = (userId: string, role: RDCRoleType, streamId: number) => {
    rdcEngine?.quitControl(userId, role, streamId);
  };

  const handleRequestControl = (userId: string, name: string) => {
    rdcEngine?.requestControl(userId);
    message.success(`Control request has been sent to ${name}.`);
  };

  const handleBeforeunload = useCallback(() => {
    if (!rdcEngine) {
      return;
    }
    profiles
      .filter((p) => userIdsUnderControl.includes(p.userId))
      .forEach(({ userId, rdcRole }) => rdcEngine.quitControl(userId, rdcRole));
    rdcEngine.leave();
    rdcEngine.dispose();
  }, [rdcEngine, userIdsUnderControl, profiles]);

  // Handle RDCEngine Events
  useEffect(() => {
    if (!rdcEngine) {
      return;
    }
    rdcEngine.on('rdc-request-control-authorized', handleRequestControlAuthorized);
    rdcEngine.on('rdc-request-control-unauthorized', handleRequestControlUnauthorized);
    rdcEngine.on('rdc-quit-control', handleQuitControlEvent);
    rdcEngine.on('rdc-remote-paste', handleRemotePaste);
    return () => {
      rdcEngine.off('rdc-request-control-authorized', handleRequestControlAuthorized);
      rdcEngine.off('rdc-request-control-unauthorized', handleRequestControlUnauthorized);
      rdcEngine.off('rdc-quit-control', handleQuitControlEvent);
      rdcEngine.off('rdc-remote-paste', handleRemotePaste);
    };
  }, [
    handleQuitControlEvent,
    handleRequestControlAuthorized,
    handleRequestControlUnauthorized,
    handleRemotePaste,
    rdcEngine,
  ]);

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeunload);
    return () => window.removeEventListener('beforeunload', handleBeforeunload);
  }, [rdcEngine, handleBeforeunload]);

  const renderItem = (profile: Profile) => (
    <List.Item>
      <div>
        <span style={{ marginRight: 10 }}>{profile.name}</span>
        <Button
          type="link"
          onClick={() => handleRequestControl(profile.userId, profile.name)}
          disabled={userIdsUnderControl.includes(profile.userId)}>
          Request Control
        </Button>
        <Divider type="vertical" />
        <Button
          type="link"
          onClick={() => handleQuitControl(profile.userId, profile.rdcRole, profile.screenStreamId)}
          disabled={!userIdsUnderControl.includes(profile.userId)}>
          Quit Control
        </Button>
      </div>
    </List.Item>
  );

  return session && session.rdcRole === RDCRoleType.HOST ? (
    <>
      <Tabs >
        {profiles
          .filter((profile) => userIdsUnderControl.includes(profile.userId))
          .map((profile) => (
            <Tabs.TabPane tab={profile.name} key={profile.userId} forceRender>
              <Spin
                spinning={pasting}
                tip="File is pasting..."
                indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}>
                <Controller userId={profile.userId} streamId={profile.screenStreamId}/>
              </Spin>
            </Tabs.TabPane>
          ))}
      </Tabs>
      <Profiles renderItem={renderItem} />
    </>
  ) : null;
};
